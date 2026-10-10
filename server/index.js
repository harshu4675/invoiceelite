import mongoose from "mongoose";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
const config = loadConfig();
await mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
});
const hello = await mongoose.connection.db.admin().command({ hello: 1 });
if (!hello.setName && hello.msg !== "isdbgrid")
  throw new Error(
    "MongoDB replica set required for transactional billing. See README.",
  );
await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
const server = createApp(config).listen(
  process.env.PORT || 3001,
  "0.0.0.0",
  () => console.log("InvoiceElite API ready"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    }),
  );
