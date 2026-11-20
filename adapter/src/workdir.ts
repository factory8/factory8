// The step's checkout, /f8/<owner>/<repo>, so Claude Code files its sessions under the repo (M8 design D8).
export const ROOT = process.env.FACTORY8_ROOT ?? '/f8';

const NAME = /^\w[\w.-]*\/\w[\w.-]*$/; // no segment starts with `.`, so none clashes with /f8/.clone
const OWN = ['home', 'state', 'plugin']; // the adapter's own directories under /f8

// `workdir` from the default branch's .factory8/project.yaml, else the URL's last two segments; throws the reason it's refused.
export function workdir(url: string, projectYaml?: string) {
  // shortcut: reads only a top-level `workdir:` line; use a YAML parser, and ship the adapter's dependencies in the image, when project.yaml gets a second key.
  const pinned = projectYaml?.match(/^workdir:[ \t]*(["']?)(.*?)\1[ \t]*(?:#.*)?\r?$/m)?.[2];
  const name = pinned ?? url.replace(/\.git$/, '').split('/').slice(-2).join('/');
  if (NAME.test(name) && !OWN.includes(name.split('/')[0])) return `${ROOT}/${name}`;
  const rule = `it must be <owner>/<repo>, each starting with a letter, a digit or _, then letters, digits, ., _ or -, and the owner can't be ${OWN.join(', ')}`;
  throw new Error(pinned === undefined
    ? `the checkout name ${JSON.stringify(name)} from the repo URL is refused: ${rule}; set workdir in .factory8/project.yaml`
    : `workdir ${JSON.stringify(name)} in .factory8/project.yaml is refused: ${rule}`);
}
