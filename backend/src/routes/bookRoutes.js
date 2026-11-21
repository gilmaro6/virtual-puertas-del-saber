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

// Parametrizacion del catalogo (solo ADMIN)
router.post('/categories', verifyToken, requireRole('ADMIN'), bookController.createCategory);
router.put('/categories/:id', verifyToken, requireRole('ADMIN'), bookController.updateCategory);
router.delete('/categories/:id', verifyToken, requireRole('ADMIN'), bookController.deleteCategory);

router.post('/authors', verifyToken, requireRole('ADMIN'), bookController.createAuthor);
router.put('/authors/:id', verifyToken, requireRole('ADMIN'), bookController.updateAuthor);
router.delete('/authors/:id', verifyToken, requireRole('ADMIN'), bookController.deleteAuthor);

router.post('/publishers', verifyToken, requireRole('ADMIN'), bookController.createPublisher);
router.put('/publishers/:id', verifyToken, requireRole('ADMIN'), bookController.updatePublisher);
router.delete('/publishers/:id', verifyToken, requireRole('ADMIN'), bookController.deletePublisher);

router.post('/formats', verifyToken, requireRole('ADMIN'), bookController.createFormat);
router.put('/formats/:id', verifyToken, requireRole('ADMIN'), bookController.updateFormat);
router.delete('/formats/:id', verifyToken, requireRole('ADMIN'), bookController.deleteFormat);

// Administracion de libros (solo ADMIN)
router.post('/', verifyToken, requireRole('ADMIN'), bookController.createBook);
router.put('/:id', verifyToken, requireRole('ADMIN'), bookController.updateBook);
router.delete('/:id', verifyToken, requireRole('ADMIN'), bookController.deleteBook);

module.exports = router;
