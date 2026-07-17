export const authorize = (...allowedRoles) => {
  return async (c, next) => {
    const user = c.get('user');
    if (!user || !allowedRoles.includes(user.role)) {
      return c.json({ message: 'Access denied: not allowed role' }, 403);
    }
    await next();
  };
};