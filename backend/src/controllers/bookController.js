const bookService = require('../services/bookService');

async function listBooks(req, res, next) {
  try {
    const result = await bookService.listBooks(req.query);
    res.status(200).json({ status: 'ok', data: result });
  } catch (error) {
    next(error);
  }
}

async function getBookById(req, res, next) {
  try {
    const book = await bookService.getBookById(req.params.id);
    res.status(200).json({ status: 'ok', data: book });
  } catch (error) {
    next(error);
  }
}

async function getCatalogMetadata(req, res, next) {
  try {
    const meta = await bookService.getCatalogMetadata();
    res.status(200).json({ status: 'ok', data: meta });
  } catch (error) {
    next(error);
  }
}

async function createBook(req, res, next) {
  try {
    const book = await bookService.createBook(req.body, req.user.id, req.ip);
    res.status(201).json({ status: 'ok', message: 'Libro registrado correctamente', data: book });
  } catch (error) {
    next(error);
  }
}

async function updateBook(req, res, next) {
  try {
    const book = await bookService.updateBook(req.params.id, req.body, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Libro actualizado correctamente', data: book });
  } catch (error) {
    next(error);
  }
}

async function deleteBook(req, res, next) {
  try {
    await bookService.deleteBook(req.params.id, req.user.id, req.ip);
    res.status(200).json({ status: 'ok', message: 'Libro descontinuado correctamente' });
  } catch (error) {
    next(error);
  }
}

async function addOrUpdateReview(req, res, next) {
  try {
    const book = await bookService.addOrUpdateReview(req.params.id, req.user.id, req.body);
    res.status(201).json({ status: 'ok', message: 'Resena guardada correctamente', data: book });
  } catch (error) {
    next(error);
  }
}

async function createCategory(req, res, next) {
  try {
    const category = await bookService.createCategory(req.body);
    res.status(201).json({ status: 'ok', message: 'Categoria creada correctamente', data: category });
  } catch (error) {
    next(error);
  }
}

async function createAuthor(req, res, next) {
  try {
    const author = await bookService.createAuthor(req.body);
    res.status(201).json({ status: 'ok', message: 'Autor creado correctamente', data: author });
  } catch (error) {
    next(error);
  }
}

async function createPublisher(req, res, next) {
  try {
    const publisher = await bookService.createPublisher(req.body);
    res.status(201).json({ status: 'ok', message: 'Editorial creada correctamente', data: publisher });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listBooks,
  getBookById,
  getCatalogMetadata,
  createBook,
  updateBook,
  deleteBook,
  addOrUpdateReview,
  createCategory,
  createAuthor,
  createPublisher
};
