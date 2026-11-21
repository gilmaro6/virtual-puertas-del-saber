const express = require('express');
const cartController = require('../controllers/cartController');
const { verifyToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(verifyToken);

router.get('/', cartController.getCart);
router.post('/', cartController.addItem);
router.put('/:itemId', cartController.updateItem);
router.delete('/:itemId', cartController.removeItem);
router.delete('/', cartController.clearCart);

module.exports = router;
