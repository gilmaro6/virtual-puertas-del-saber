const express = require('express');
const userController = require('../controllers/userController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(verifyToken, requireRole('ADMIN'));

router.get('/', userController.listUsers);
router.put('/:id', userController.updateUser);
router.patch('/:id/password', userController.resetUserPassword);

module.exports = router;
