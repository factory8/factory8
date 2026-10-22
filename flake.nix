{
  description = "Factory8 — self-hosted AI-native software factory";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }:
    let
      forAll = f: nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" ] (system: f nixpkgs.legacyPackages.${system});
    in {
      devShells = forAll (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_24 # LTS; move to 26 once Temporal's TypeScript SDK supports it
            temporal-cli
            kubectl
            d2
            python3 # serves docs/site
          ];
        };
      });
    };
}
