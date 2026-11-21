const orderService = require('../services/orderService');

async function createOrder(req, res, next) {
  try {
    const order = await orderService.createOrder(req.user.id, req.body, req.ip);
    res.status(201).json({ status: 'ok', message: 'Pedido realizado correctamente', data: order });
  } catch (error) {
    next(error);
  }
}

async function getMyOrders(req, res, next) {
  try {
    const orders = await orderService.getMyOrders(req.user.id);
    res.status(200).json({ status: 'ok', data: orders });
  } catch (error) {
    next(error);
  }
}

async function getMyRentals(req, res, next) {
  try {
    const rentals = await orderService.getMyRentals(req.user.id);
    res.status(200).json({ status: 'ok', data: rentals });
  } catch (error) {
    next(error);
  }
}

async function getOrderById(req, res, next) {
  try {
    const order = await orderService.getOrderById(req.params.id, req.user.id, req.user.rol);
    res.status(200).json({ status: 'ok', data: order });
  } catch (error) {
    next(error);
  }
}

async function listAllOrders(req, res, next) {
  try {
    const orders = await orderService.listAllOrders(req.query);
    res.status(200).json({ status: 'ok', data: orders });
  } catch (error) {
    next(error);
  }
}

async function updateOrderStatus(req, res, next) {
  try {
    const order = await orderService.updateOrderStatus(req.params.id, req.body, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Estado del pedido actualizado', data: order });
  } catch (error) {
    next(error);
  }
}

async function returnRental(req, res, next) {
  try {
    const rental = await orderService.returnRental(req.params.rentalId, req.body, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Devolucion registrada correctamente', data: rental });
  } catch (error) {
    next(error);
  }
}

async function getInventoryHistory(req, res, next) {
  try {
    const history = await orderService.getInventoryHistory(req.query.limit);
    res.status(200).json({ status: 'ok', data: history });
  } catch (error) {
    next(error);
  }
}

async function getAuditHistory(req, res, next) {
  try {
    const history = await orderService.getAuditHistory(req.query.limit);
    res.status(200).json({ status: 'ok', data: history });
  } catch (error) {
    next(error);
  }
}

async function getOrderInvoice(req, res, next) {
  try {
    const invoice = await orderService.getOrderInvoice(req.params.id, req.user.id, req.user.rol);
    res.status(200).json({ status: 'ok', data: invoice });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createOrder,
  getMyOrders,
  getMyRentals,
  getOrderById,
  getOrderInvoice,
  listAllOrders,
  updateOrderStatus,
  returnRental,
  getInventoryHistory,
  getAuditHistory
};
