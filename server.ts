const dev = Bun.env.NODE_ENV !== "production";
const nextArgs = dev ? ["next", "dev"] : ["next", "start"];

console.log("\n  NovaRacing Telemetry Dashboard");
console.log("  Next.js  → http://localhost:3000");
console.log("  WS Proxy → ws://localhost:3001\n");

const nextProc = Bun.spawn(["bunx", ...nextArgs], {
  stdout: "inherit",
  stderr: "inherit",
  env: { ...Bun.env },
});

const wsProc = Bun.spawn(["bun", "ws-server.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  env: { ...Bun.env },
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    nextProc.kill();
    wsProc.kill();
    process.exit(0);
  });
}

await Promise.all([nextProc.exited, wsProc.exited]);
