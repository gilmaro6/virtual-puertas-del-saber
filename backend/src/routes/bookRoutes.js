const express = require('express');
const bookController = require('../controllers/bookController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

// Rutas publicas del catalogo
router.get('/', bookController.listBooks);
router.get('/meta', bookController.getCatalogMetadata);
router.get('/:id', bookController.getBookById);

// Resenas (usuarios autenticados)
router.post('/:id/reviews', verifyToken, bookController.addOrUpdateReview);

// Administracion del catalogo (solo ADMIN)
router.post('/categories', verifyToken, requireRole('ADMIN'), bookController.createCategory);
router.post('/authors', verifyToken, requireRole('ADMIN'), bookController.createAuthor);
router.post('/publishers', verifyToken, requireRole('ADMIN'), bookController.createPublisher);
router.post('/', verifyToken, requireRole('ADMIN'), bookController.createBook);
router.put('/:id', verifyToken, requireRole('ADMIN'), bookController.updateBook);
router.delete('/:id', verifyToken, requireRole('ADMIN'), bookController.deleteBook);

module.exports = router;
