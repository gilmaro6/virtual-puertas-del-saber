const express = require('express');
const userController = require('../controllers/userController');
const { verifyToken, requirePermission } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(verifyToken);

router.get('/', requirePermission('USUARIOS_VER'), userController.listUsers);
router.put('/:id', requirePermission('USUARIOS_EDITAR'), userController.updateUser);
router.patch('/:id/password', requirePermission('USUARIOS_RESET_PASSWORD'), userController.resetUserPassword);
router.get('/:id/permissions', requirePermission('ROLES_PERMISOS_GESTIONAR'), userController.getUserPermissions);
router.put('/:id/permissions', requirePermission('ROLES_PERMISOS_GESTIONAR'), userController.updateUserPermissions);

module.exports = router;
