import { spawnSync } from "node:child_process";

const targets = [
  { project: "album-php-mysql", image: "mysql:8.0" },
  { project: "album-php-mariadb", image: "mariadb:11.4" },
];
let status = 0;
for (const target of targets) {
  const compose = ["compose", "-p", target.project, "-f", "hostinger-php/compose.test.yml"];
  const env = { ...process.env, TEST_DATABASE_IMAGE: target.image };
  const run = spawnSync("docker", [...compose, "up", "--build", "--abort-on-container-exit", "--exit-code-from", "php-test"], {
    cwd: process.cwd(), stdio: "inherit", shell: process.platform === "win32", env,
  });
  spawnSync("docker", [...compose, "down", "--volumes", "--remove-orphans"], {
    cwd: process.cwd(), stdio: "inherit", shell: process.platform === "win32", env,
  });
  if ((run.status ?? 1) !== 0) {
    status = run.status ?? 1;
    break;
  }
}
process.exit(status);
