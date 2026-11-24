const roleService = require('../services/roleService');

async function listRoles(req, res, next) {
  try {
    const roles = await roleService.listRoles();
    res.status(200).json({ status: 'ok', data: roles });
  } catch (error) {
    next(error);
  }
}

async function listPermissions(req, res, next) {
  try {
    const permissions = await roleService.listPermissions();
    res.status(200).json({ status: 'ok', data: permissions });
  } catch (error) {
    next(error);
  }
}

async function createRole(req, res, next) {
  try {
    const role = await roleService.createRole(req.body, req.user.id, req.ip);
    res.status(201).json({ status: 'ok', message: 'Rol creado correctamente', data: role });
  } catch (error) {
    next(error);
  }
}

async function updateRolePermissions(req, res, next) {
  try {
    const role = await roleService.updateRolePermissions(req.params.id, req.body.permisosIds, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Permisos del rol actualizados', data: role });
  } catch (error) {
    next(error);
  }
}

async function deleteRole(req, res, next) {
  try {
    await roleService.deleteRole(req.params.id, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Rol eliminado correctamente' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listRoles,
  listPermissions,
  createRole,
  updateRolePermissions,
  deleteRole
};
