import { passwordInput } from "../shared/domain.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User, AuditLog } from "./models.js";
const {
  RESET_USER_EMAIL: email,
  RESET_USER_PASSWORD: password,
  MONGODB_URI: uri,
} = process.env;
if (!email || !password || password.length < 12 || password.length > 128)
  throw new Error(
    "Set RESET_USER_EMAIL and RESET_USER_PASSWORD (12–72 characters, at most 72 UTF-8 bytes) in the process environment. Never pass passwords as CLI arguments.",
  );
passwordInput.parse(password);
await mongoose.connect(uri);
await mongoose.connection.transaction(async (session) => {
  const user = await User.findOne({ email: email.toLowerCase() }).session(
    session,
  );
  if (!user) throw new Error("User not found");
  user.passwordHash = await bcrypt.hash(password, 12);
  user.tokenVersion += 1;
  await user.save({ session });
  await AuditLog.create(
    [
      {
        actor: user._id,
        action: "user.passwordResetByOperator",
        entityId: String(user._id),
        details: { source: "operator-cli" },
      },
    ],
    { session },
  );
});
await mongoose.disconnect();
console.log("Password reset and all existing sessions revoked.");
