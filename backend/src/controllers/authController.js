const AuthService = require('../services/AuthService');
const LoggerService = require('../services/LoggerService');
const { validate, registerSchema, loginSchema } = require('../validators');

class AuthController {
  static async register(req, res, next) {
    try {
      const data = validate(registerSchema)(req.body);
      const result = await AuthService.register(data);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async login(req, res, next) {
    try {
      const data = validate(loginSchema)(req.body);
      const result = await AuthService.login(data);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async profile(req, res, next) {
    try {
      const user = await AuthService.getProfile(req.user._id);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AuthController;
