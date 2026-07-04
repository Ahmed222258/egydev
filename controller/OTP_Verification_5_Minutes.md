# OTP Verification (5 Minutes)

## Flow

1.  User submits email and password.
2.  Verify email and password.
3.  Generate a 6-digit OTP.
4.  Hash the OTP before storing it.
5.  Save:
    -   `otpHash`
    -   `otpExpiresAt = Date.now() + 5 * 60 * 1000`
    -   optional: `otpAttempts = 0`
6.  Send the OTP by email using Nodemailer.
7.  Return a response such as `OTP sent`.
8.  User submits the OTP to `/verify-otp`.
9.  Verify:
    -   User exists.
    -   OTP has not expired.
    -   OTP matches the stored hash.
10. Clear OTP fields and generate the JWT only after successful
    verification.

## Recommended User Fields

``` js
otpHash: String,
otpExpiresAt: Date,
otpAttempts: Number
```

## Security Checklist

-   OTP length: 6 digits.
-   Expiration: 5 minutes.
-   Hash the OTP (bcrypt or crypto); never store it in plain text.
-   Delete/clear the OTP after successful verification.
-   Limit verification attempts (e.g. 5 attempts).
-   Rate-limit OTP generation requests.
-   Do not issue a JWT until OTP verification succeeds.
-   Use HTTPS in production.
-   Store email credentials and JWT secret in `.env`.

## Optional Improvements

-   Resend OTP endpoint with cooldown (e.g. 60 seconds).
-   Maximum resend count.
-   Audit login attempts.
-   Use Redis with TTL instead of MongoDB for large-scale systems.

## APIs

-   POST /auth/login
-   POST /auth/verify-otp
-   POST /auth/resend-otp (optional)

## References

-   https://nodemailer.com/
-   https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
-   https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
