const cartService = require('../services/cartService');

async function getCart(req, res, next) {
  try {
    const cart = await cartService.getCart(req.user.id);
    res.status(200).json({ status: 'ok', data: cart });
  } catch (error) {
    next(error);
  }
}

async function addItem(req, res, next) {
  try {
    const cart = await cartService.addItem(req.user.id, req.body);
    res.status(201).json({ status: 'ok', message: 'Producto agregado al carrito', data: cart });
  } catch (error) {
    next(error);
  }
}

async function updateItem(req, res, next) {
  try {
    const cart = await cartService.updateItem(req.user.id, req.params.itemId, req.body);
    res.status(200).json({ status: 'ok', message: 'Carrito actualizado', data: cart });
  } catch (error) {
    next(error);
  }
}

async function removeItem(req, res, next) {
  try {
    const cart = await cartService.removeItem(req.user.id, req.params.itemId);
    res.status(200).json({ status: 'ok', message: 'Producto eliminado del carrito', data: cart });
  } catch (error) {
    next(error);
  }
}

async function clearCart(req, res, next) {
  try {
    const cart = await cartService.clearCart(req.user.id);
    res.status(200).json({ status: 'ok', message: 'Carrito vaciado', data: cart });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart
};
