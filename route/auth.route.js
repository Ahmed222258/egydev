const express = require('express');
const router = express.Router();
const auth = require('../controller/auth.controller');

router.post('/login',auth.login);
router.post('/verify-otp', auth.verifyOtp);
router.post('/resend-otp', auth.resendOtp);

module.exports = router;