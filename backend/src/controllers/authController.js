const authService = require('../services/authService');

function getCaptcha(req, res) {
  const captcha = authService.generateCaptcha();
  res.status(200).json({
    status: 'ok',
    data: captcha
  });
}

async function register(req, res, next) {
  try {
    const result = await authService.register(req.body, req.ip);
    res.status(201).json({
      status: 'ok',
      message: 'Usuario registrado correctamente',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.login(req.body, req.ip);
    res.status(200).json({
      status: 'ok',
      message: 'Inicio de sesion exitoso',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

async function getProfile(req, res, next) {
  try {
    const profile = await authService.getProfile(req.user.id);
    res.status(200).json({
      status: 'ok',
      data: profile
    });
  } catch (error) {
    next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    const profile = await authService.updateProfile(req.user.id, req.body, req.ip);
    res.status(200).json({
      status: 'ok',
      message: 'Perfil actualizado correctamente',
      data: profile
    });
  } catch (error) {
    next(error);
  }
}

async function logout(req, res, next) {
  try {
    await authService.logout(req.user.id, req.ip);
    res.status(200).json({
      status: 'ok',
      message: 'Sesion cerrada correctamente'
    });
  } catch (error) {
    next(error);
  }
}

function checkAdminAccess(req, res) {
  res.status(200).json({
    status: 'ok',
    message: 'Acceso autorizado para administrador',
    user: {
      id: req.user.id,
      email: req.user.email,
      rol: req.user.rol
    }
  });
}

async function forgotPassword(req, res, next) {
  try {
    const result = await authService.requestPasswordReset(req.body, req.ip);
    res.status(200).json({
      status: 'ok',
      message: 'Codigo de recuperacion generado correctamente',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    await authService.resetPasswordWithCode(req.body, req.ip);
    res.status(200).json({
      status: 'ok',
      message: 'Contrasena actualizada correctamente. Ya puedes iniciar sesion.'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCaptcha,
  register,
  login,
  getProfile,
  updateProfile,
  forgotPassword,
  resetPassword,
  logout,
  checkAdminAccess
};
