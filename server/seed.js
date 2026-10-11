import { passwordInput } from "../shared/domain.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User, Company } from "./models.js";
if (
  !process.env.SEED_ADMIN_EMAIL ||
  !process.env.SEED_ADMIN_PASSWORD ||
  process.env.SEED_ADMIN_PASSWORD.length < 12 ||
  process.env.SEED_ADMIN_PASSWORD.startsWith("replace-")
)
  throw new Error(
    "Set a unique SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (12+ characters)",
  );
passwordInput.parse(process.env.SEED_ADMIN_PASSWORD);
await mongoose.connect(process.env.MONGODB_URI);
await Promise.all([User.init(), Company.init()]);
let user = await User.findOne({
  email: process.env.SEED_ADMIN_EMAIL.toLowerCase(),
});
if (!user) {
  user = await User.create({
    name: "Administrator",
    email: process.env.SEED_ADMIN_EMAIL.toLowerCase(),
    passwordHash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 12),
    role: "admin",
    companyIds: [],
  });
  console.log("Administrator created");
} else console.log("Administrator already exists; password unchanged");
if (process.argv.includes("--sample")) {
  await Company.updateOne(
    { name: "Example Engineering (Sample)" },
    {
      $setOnInsert: {
        name: "Example Engineering (Sample)",
        contact: "Sample Contact",
        email: "accounts@example.test",
        address: "Example Industrial Estate, Mumbai (fictional)",
        terms: "Payment within 30 days",
        defaultRate: 500,
        archived: false,
      },
    },
    { upsert: true },
  );
  console.log("Fictional sample company ready");
}
await mongoose.disconnect();
