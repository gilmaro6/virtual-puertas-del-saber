const userService = require('../services/userService');
const roleService = require('../services/roleService');

async function getUserPermissions(req, res, next) {
  try {
    const detail = await roleService.getUserPermissionsDetail(req.params.id);
    res.status(200).json({ status: 'ok', data: detail });
  } catch (error) {
    next(error);
  }
}

async function updateUserPermissions(req, res, next) {
  try {
    const detail = await roleService.updateUserPermissions(
      req.params.id,
      req.body.overrides,
      req.user.id,
      req.ip
    );
    res.status(200).json({
      status: 'ok',
      message: 'Permisos individuales actualizados correctamente',
      data: detail
    });
  } catch (error) {
    next(error);
  }
}

async function listUsers(req, res, next) {
  try {
    const users = await userService.listUsers(req.query);
    res.status(200).json({ status: 'ok', data: users });
  } catch (error) {
    next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    const user = await userService.updateUser(req.params.id, req.body, req.user.id, req.ip);
    res.status(200).json({
      status: 'ok',
      message: 'Datos de usuario actualizados correctamente',
      data: user
    });
  } catch (error) {
    next(error);
  }
}

async function resetUserPassword(req, res, next) {
  try {
    await userService.resetUserPassword(req.params.id, req.body, req.user.id, req.ip);
    res.status(200).json({
      status: 'ok',
      message: 'Contrasena restablecida correctamente'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listUsers,
  updateUser,
  resetUserPassword,
  getUserPermissions,
  updateUserPermissions
};
