const couponService = require('../services/couponService');

async function listCoupons(req, res, next) {
  try {
    const coupons = await couponService.listCoupons();
    res.status(200).json({ status: 'ok', data: coupons });
  } catch (error) {
    next(error);
  }
}

async function validateCoupon(req, res, next) {
  try {
    const result = await couponService.validateCouponCode(req.body.codigo, req.body.subtotal);
    res.status(200).json({ status: 'ok', message: 'Cupon aplicado correctamente', data: result });
  } catch (error) {
    next(error);
  }
}

async function createCoupon(req, res, next) {
  try {
    const coupon = await couponService.createCoupon(req.body, req.user.id, req.ip);
    res.status(201).json({ status: 'ok', message: 'Cupon creado correctamente', data: coupon });
  } catch (error) {
    next(error);
  }
}

async function updateCoupon(req, res, next) {
  try {
    const coupon = await couponService.updateCoupon(req.params.id, req.body, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Cupon actualizado correctamente', data: coupon });
  } catch (error) {
    next(error);
  }
}

async function deleteCoupon(req, res, next) {
  try {
    await couponService.deleteCoupon(req.params.id, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Cupon eliminado correctamente' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listCoupons,
  validateCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon
};
