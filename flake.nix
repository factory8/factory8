{
  description = "Factory8 — self-hosted AI-native software factory";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs, ... }:
    let
      inherit (nixpkgs) lib;
      pkgsFor = system: import nixpkgs {
        inherit system;
        config.allowUnfreePredicate = p: lib.getName p == "claude-code";
      };
      forAll = f: lib.genAttrs [ "x86_64-linux" "aarch64-linux" ] (system: f (pkgsFor system));
      # Node, the workspaces and their production dependencies, shared by the worker's image and f8.
      appFor = pkgs: let
        src = lib.fileset.toSource {
          root = ./.;
          fileset = lib.fileset.unions [ ./package.json ./package-lock.json ./adapter ./worker ./cli ];
        };
      in pkgs.buildNpmPackage {
        pname = "factory8";
        version = "0";
        inherit src;
        nodejs = pkgs.nodejs_24;
        npmDeps = pkgs.importNpmLock { npmRoot = src; };
        npmConfigHook = pkgs.importNpmLock.npmConfigHook;
        npmFlags = [ "--omit=dev" ];
        dontNpmBuild = true;
        installPhase = "mkdir $out && cp -r node_modules adapter worker cli $out/";
      };
    in {
      # A project's sandbox image (M1 design D3): its dev shell's packages, stdenv's base tools as `nix develop`
      # gives them, the agent's tools and the adapter. The tag is the image's Nix hash. The shell's shellHook is lost.
      lib.sandboxImage = { pkgs, shell, name }:
        let
          adapter = pkgs.runCommand "f8-adapter" { nativeBuildInputs = [ pkgs.makeWrapper ]; } ''
            mkdir -p $out/bin $out/lib
            cp -r ${./adapter/src} $out/lib/src
            cp ${./adapter/package.json} $out/lib/package.json
            makeWrapper ${pkgs.nodejs_24}/bin/node $out/bin/f8-adapter --add-flags $out/lib/src/main.ts
            cp ${./adapter/bin/f8-ask} $out/bin/f8-ask
          '';
        in pkgs.dockerTools.streamLayeredImage {
          inherit name;
          contents = lib.unique (shell.nativeBuildInputs ++ shell.buildInputs ++ pkgs.stdenv.initialPath ++ (with pkgs; [
            claude-code git gh nodejs_24 adapter bashInteractive
            dockerTools.binSh dockerTools.caCertificates dockerTools.fakeNss
          ]));
          extraCommands = "mkdir -m 1777 tmp";
          config = {
            Entrypoint = [ "/bin/f8-adapter" "serve" ];
            Env = [ "PATH=/bin" "SSL_CERT_FILE=/etc/ssl/certs/ca-bundle.crt" ];
            ExposedPorts."7070/tcp" = { };
          };
        };

      # A worker's image (M7 design D1): the built-in flows and, with `workflows`, a directory whose index.ts exports
      # a project's own, bundled at build (D4) and pinned with the plugin to this commit (D9). `pkgs` only picks the
      # system: Node and the npm dependencies are ours.
      lib.workerImage = { pkgs, name, workflows ? null }:
        let
          fpkgs = pkgsFor pkgs.stdenv.hostPlatform.system;
          app = appFor fpkgs;
          entry = fpkgs.writeText "workflows.ts" (''
            export { sdlcWorkflow, shipWorkflow } from '@factory8/worker/workflows';
          '' + lib.optionalString (workflows != null) ''
            export * from '${workflows}/index.ts';
          '');
          bundle = fpkgs.runCommand "${name}-workflows.js" { } "${fpkgs.nodejs_24}/bin/node ${app}/worker/src/bundle.ts ${entry} $out";
        in fpkgs.dockerTools.streamLayeredImage {
          inherit name;
          config.Entrypoint = [ "${fpkgs.nodejs_24}/bin/node" "${app}/worker/src/main.ts" ];
          config.Env = [
            "FACTORY8_WORKFLOW_BUNDLE=${bundle}"
            "FACTORY8_PLUGIN_REF=${self.rev or (throw "lib.workerImage: Factory8's tree has uncommitted changes, so there's no commit to pin")}"
          ];
        };

      packages = forAll (pkgs: let app = appFor pkgs; in {
        sandbox-image = self.lib.sandboxImage {
          inherit pkgs;
          name = "factory8-sandbox";
          shell = self.devShells.${pkgs.stdenv.hostPlatform.system}.default;
        };

        # The worker's image (M1 design D4).
        worker-image = pkgs.dockerTools.streamLayeredImage {
          name = "factory8-worker";
          config.Entrypoint = [ "${pkgs.nodejs_24}/bin/node" "${app}/worker/src/main.ts" ];
        };

        # f8 on the laptop (M1 design D5): nix run <this repo>#f8 -- run 12
        f8 = pkgs.runCommand "f8" { nativeBuildInputs = [ pkgs.makeWrapper ]; } ''
          makeWrapper ${pkgs.nodejs_24}/bin/node $out/bin/f8 --add-flags ${app}/cli/src/main.ts
        '';
      });

      devShells = forAll (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_24 # LTS; move to 26 once Temporal's TypeScript SDK supports it
            temporal-cli
            kubectl
            kubernetes-helm # deploy/'s vendor charts
            d2
            uv # runs all Python (AGENTS.md)
            python3 # uv's interpreter; serves docs/site
          ];
        };
      });
    };
}
