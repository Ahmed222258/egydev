import jwt from 'jsonwebtoken';
import User from '../model/user.model.js';
import { getCookie } from 'hono/cookie';

export const authenticate = async (c, next) => {
  let token = getCookie(c, 'token');

  const authHeader = c.req.header('Authorization');
  if (!token && authHeader?.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return c.json({ message: 'No Token Provided' }, 401);
  }

  try {
    const decode = jwt.verify(token, c.env.JWT_SECRET);
    const user = await User.findById(decode.id).select('-password');
    if (!user) {
      return c.json({ message: 'User not found' }, 401);
    }
    c.set('user', user);
    await next();
  } catch (err) {
    return c.json({ message: 'Token invalid or expired' }, 403);
  }
};