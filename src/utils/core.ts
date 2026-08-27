import crypto from "crypto";

// --------------------------- OTP -----------------------------------------------
export function generateOTP(
  length = 6
): { otp: string; otpHash: string } {
  const digits = "0123456789";
  let otp = "";

  for (let i = 0; i < length; i++) {
    otp += digits[crypto.randomInt(0, digits.length)];
  }

  const otpHash = crypto
    .createHash("sha256")
    .update(otp)
    .digest("hex");

  return { otp, otpHash };
}

export function verifyOTP(
  inputOTP: string,
  storedHash: string
): boolean {
  const hash = crypto
    .createHash("sha256")
    .update(inputOTP)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(storedHash)
  );
}

// --------------------------- TOKEN -----------------------------------------------
export function generateToken(): {
  token: string, tokenHash: string
} {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  return { token, tokenHash };
}

export function verifyToken(
  receivedToken: string,
  storedHash: string
): boolean {
  const receivedHash = crypto
    .createHash("sha256")
    .update(receivedToken)
    .digest("hex");

  // timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(receivedHash),
    Buffer.from(storedHash)
  );
}

export function formatUTCDate(date: Date | string) {
  const d = new Date(date);

  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }) + " UTC";
}

export function cropText(text: string, maxLength = 100) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

export function cropByWord(text:string, maxLength = 100) {
  if (text.length <= maxLength) return text;

  const trimmed = text.slice(0, maxLength);
  return trimmed.slice(0, trimmed.lastIndexOf(" ")) + "...";
}