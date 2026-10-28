{
  description = "Factory8 — self-hosted AI-native software factory";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs, ... }:
    let
      inherit (nixpkgs) lib;
      forAll = f: lib.genAttrs [ "x86_64-linux" "aarch64-linux" ] (system: f (import nixpkgs {
        inherit system;
        config.allowUnfreePredicate = p: lib.getName p == "claude-code";
      }));
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

      packages = forAll (pkgs: {
        sandbox-image = self.lib.sandboxImage {
          inherit pkgs;
          name = "factory8-sandbox";
          shell = self.devShells.${pkgs.stdenv.hostPlatform.system}.default;
        };

        # The worker's image (M1 design D4): Node, the worker and its production dependencies.
        worker-image = let
          src = lib.fileset.toSource {
            root = ./.;
            fileset = lib.fileset.unions [ ./package.json ./package-lock.json ./adapter ./worker ];
          };
          app = pkgs.buildNpmPackage {
            pname = "f8-worker";
            version = "0";
            inherit src;
            nodejs = pkgs.nodejs_24;
            npmDeps = pkgs.importNpmLock { npmRoot = src; };
            npmConfigHook = pkgs.importNpmLock.npmConfigHook;
            npmFlags = [ "--omit=dev" ];
            dontNpmBuild = true;
            installPhase = "mkdir $out && cp -r node_modules adapter worker $out/";
          };
        in pkgs.dockerTools.streamLayeredImage {
          name = "factory8-worker";
          config.Entrypoint = [ "${pkgs.nodejs_24}/bin/node" "${app}/worker/src/main.ts" ];
        };
      });

      devShells = forAll (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_24 # LTS; move to 26 once Temporal's TypeScript SDK supports it
            temporal-cli
            kubectl
            kubernetes-helm # deploy/'s vendor charts
            d2
            python3 # serves docs/site
          ];
        };
      });
    };
}
