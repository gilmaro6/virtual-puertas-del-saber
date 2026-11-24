const express = require('express');
const roleController = require('../controllers/roleController');
const { verifyToken, requirePermission } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(verifyToken);

router.get('/', requirePermission('ROLES_PERMISOS_GESTIONAR', 'USUARIOS_VER'), roleController.listRoles);
router.get('/permissions', requirePermission('ROLES_PERMISOS_GESTIONAR'), roleController.listPermissions);
router.post('/', requirePermission('ROLES_PERMISOS_GESTIONAR'), roleController.createRole);
router.put('/:id/permissions', requirePermission('ROLES_PERMISOS_GESTIONAR'), roleController.updateRolePermissions);
router.delete('/:id', requirePermission('ROLES_PERMISOS_GESTIONAR'), roleController.deleteRole);

module.exports = router;
