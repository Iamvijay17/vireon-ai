const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');
const LoggerService = require('./LoggerService');

/**
 * Authentication service.
 * Single Responsibility: User authentication and JWT token management.
 */
class AuthService {
  /**
   * Register a new user.
   */
  static async register({ name, email, password }) {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      throw { status: 409, message: 'Email already registered' };
    }

    const user = await User.create({ name, email, password });
    const token = this.generateToken(user);

    LoggerService.info('User registered', { userId: user._id, email: user.email });

    return { user: user.toJSON(), token };
  }

  /**
   * Login with email and password.
   */
  static async login({ email, password }) {
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      throw { status: 401, message: 'Invalid email or password' };
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw { status: 401, message: 'Invalid email or password' };
    }

    const token = this.generateToken(user);

    LoggerService.info('User logged in', { userId: user._id });

    return { user: user.toJSON(), token };
  }

  /**
   * Generate JWT token for a user.
   */
  static generateToken(user) {
    return jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
  }

  /**
   * Get current user profile.
   */
  static async getProfile(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw { status: 404, message: 'User not found' };
    }
    return user;
  }
}

module.exports = AuthService;
