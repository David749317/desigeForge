// server.js
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const app = express();
app.use(express.json());
app.use(cors());

// Configura el pool de PostgreSQL con usuario "postgres" y contraseña "123"
const pool = new Pool({
  connectionString: 'postgresql://postgres:123@localhost:5432/design_forge_db'
});

// Registro: crea un usuario si no existe
// Ahora se incluye el campo "role" para distinguir entre "admin" y "client"
app.post('/api/register', async (req, res) => {
  const { email, password, name, role } = req.body;
  try {
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: 'El usuario ya existe' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [email, hashedPassword, name, role]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error en registro:", error);
    res.status(500).json({ message: 'Error en registro' });
  }
});

// Login: valida el usuario y la contraseña
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Usuario no registrado' });
    }
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: 'Contraseña incorrecta' });
    }
    res.json(user);
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: 'Error en login' });
  }
});

// Cotizaciones: agregar una cotización
app.post('/api/quotations', async (req, res) => {
  const { user_id, clientName, material, product, quantity } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO quotations (user_id, client_name, material, product, quantity) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [user_id, clientName, material, product, quantity]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error al guardar cotización:', error);
    res.status(500).json({ message: 'Error al guardar cotización: ' + error.message });
  }
});

// Cotizaciones: obtener cotizaciones por usuario
app.get('/api/quotations/:user_id', async (req, res) => {
  const { user_id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM quotations WHERE user_id = $1', [user_id]);
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener cotizaciones:", error);
    res.status(500).json({ message: 'Error al obtener cotizaciones' });
  }
});

// Pedidos: agregar un pedido
app.post('/api/orders', async (req, res) => {
  const { user_id, product, price, quantity } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO orders (user_id, product, price, quantity) VALUES ($1, $2, $3, $4) RETURNING *',
      [user_id, product, price, quantity]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error al agregar pedido:', error);
    res.status(500).json({ message: 'Error al agregar pedido: ' + error.message });
  }
});

// Endpoint para suspender la cuenta: mueve el usuario a suspended_users y elimina de users
app.put('/api/users/:user_id/suspend', async (req, res) => {
  const { user_id } = req.params;
  try {
    await pool.query('BEGIN');
    // Inserta el usuario en la tabla de suspendidos
    const suspendResult = await pool.query(
      `INSERT INTO suspended_users (email, password, name, role, suspended_at)
       SELECT email, password, name, role, NOW() FROM users WHERE id = $1 RETURNING *`,
      [user_id]
    );
    if (suspendResult.rowCount === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    // Elimina el usuario de la tabla principal
    await pool.query('DELETE FROM users WHERE id = $1', [user_id]);
    await pool.query('COMMIT');
    res.json({ message: 'Cuenta suspendida exitosamente.', suspendedUser: suspendResult.rows[0] });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error al suspender la cuenta:', error);
    res.status(500).json({ message: 'Error al suspender la cuenta: ' + error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
