

const express = require('express');
const dotenv = require('dotenv');
dotenv.config();
const mongoose = require('mongoose');
mongoose.set('strictPopulate', false);

const app = express();
mongoose.connect('mongodb://localhost:27017/ecommerce')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const cors = require('cors');
const categorieRoutes = require('./route/categorie.route');
const cart = require('./route/cart.route');
const product = require('./route/product.route');
const multer = require('multer');
const path = require('path');
const subcategorie = require('./route/subcategorie.routs');
const brand = require('./route/brand.route');
const testimonialRoutes = require('./route/testmonila.route');

app.use(cors());
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use('/img', express.static(path.join(__dirname, './uploads')));
app.use('/api/user',require('./route/user.route'));
const orderRoutes = require('./route/order.route');


app.use('/api/auth',require('./route/auth.route'));

app.use('/api/categories', categorieRoutes);
app.use('/api/cart', cart);
app.use('/api/product', product);
app.use('/api/brand', brand);
app.use('/api/subcategorie', subcategorie);
app.use('/api/orders', orderRoutes);
app.use('/api', testimonialRoutes);

const port = 8000;


app.listen(port, () => console.log("server started"));
