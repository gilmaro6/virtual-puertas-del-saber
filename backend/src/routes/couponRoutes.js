const express = require('express');
const couponController = require('../controllers/couponController');
const { verifyToken, requirePermission } = require('../middlewares/authMiddleware');
const { validateCouponPayload } = require('../middlewares/validators');

const router = express.Router();

router.use(verifyToken);

// Validacion de cupon en el carrito
router.post('/validate', couponController.validateCoupon);

// Administracion de cupones
router.get('/', requirePermission('PARAMETRIZACION_GESTIONAR'), couponController.listCoupons);
router.post('/', requirePermission('PARAMETRIZACION_GESTIONAR'), validateCouponPayload, couponController.createCoupon);
router.put('/:id', requirePermission('PARAMETRIZACION_GESTIONAR'), couponController.updateCoupon);
router.delete('/:id', requirePermission('PARAMETRIZACION_GESTIONAR'), couponController.deleteCoupon);

module.exports = router;
