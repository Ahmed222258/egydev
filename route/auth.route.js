import { Hono } from 'hono';
import * as authController from '../controller/auth.controller.js';

const authRoutes = new Hono();

authRoutes.post('/login', authController.login);
authRoutes.post('/verify-otp', authController.verifyOtp);
authRoutes.post('/resend-otp', authController.resendOtp);
authRoutes.post('/forgot-password', authController.forgotPassword);
authRoutes.patch('/reset-password/:token', authController.resetPassword);
authRoutes.post('/logout', authController.logout);

export default authRoutes;