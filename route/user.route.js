import { Hono } from 'hono';
import * as userController from '../controller/user.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const userRoutes = new Hono();

userRoutes.get('/', authenticate, authorize('admin'), userController.getUsers);
userRoutes.post('/createAdmin', authenticate, authorize('admin'), userController.createUser('admin'));
userRoutes.post('/', userController.createUser('user'));
userRoutes.patch('/profile', authenticate, userController.updateUser);
userRoutes.get('/profile', authenticate, userController.getProfile);

export default userRoutes;