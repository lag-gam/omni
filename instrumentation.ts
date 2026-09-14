type InstrumentedGlobal = typeof globalThis & {
  __omniServerInstrumentation?: boolean;
};

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const state = globalThis as InstrumentedGlobal;
  if (state.__omniServerInstrumentation) return;
  state.__omniServerInstrumentation = true;

  console.log(`[omni] server process online pid=${process.pid}`);

  process.on("uncaughtExceptionMonitor", (err, origin) => {
    console.error(
      `[omni] server uncaught exception origin=${origin}`,
      err.stack || err.message
    );
  });
  process.on("warning", (warning) => {
    console.warn("[omni] server warning", warning.stack || warning.message);
  });
  process.on("exit", (code) => {
    console.error(`[omni] server process exit pid=${process.pid} code=${code}`);
  });
}
