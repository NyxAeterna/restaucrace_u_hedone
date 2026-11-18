import express from 'express';
import pool from './db/pool.js';
import bcrypt from 'bcrypt';
import session from 'express-session';

const app = express();
const port = 3000;

// Nastavení EJS
app.set('view engine', 'ejs');

// Zpracování požadavků
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

// Middleware pro kontrolu přihlášení
const checkAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    } else {
        return res.redirect('/login');
   }
};



// Úvodní stránka
app.get('/', (req, res) => {
    res.render('index');
});

// Výpis kategorií
app.get('/menu', async (req, res, next) => {
    try {
        const result = await pool.query('SELECT * FROM categories');

        res.render('menu', {
            categories: result.rows
        });
    } catch (error) {
        next(error);
    }
});

// Otevírací doba
app.get('/opening-hours', (req, res) => {
    res.render('openingHours');
});

// Fotogalerie
app.get('/images', (req, res) => {
    res.render('images');
});

// Výpis jídel podle kategorie
app.get('/menu/:id', async (req, res, next) => {
    try {
        const id = req.params.id;

        const result = await pool.query(
            'SELECT * FROM menu_items WHERE category_id = $1',
            [id]
        );

        res.render('meals', {
            items: result.rows
        });
    } catch (error) {
        next(error);
    }
});

// Zobrazení přihlašovací stránky
app.get('/login', (req, res) => {
    res.render('login');
});

// Zpracování přihlášení
app.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const result = await pool.query(
            'SELECT * FROM admins WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.render('login', {error: 'Neplatné přihlašovací údaje.'});
        }

        const admin = result.rows[0];

        const comparePassword = await bcrypt.compare(
            password,
            admin.password_hash
        );

        if (!comparePassword) {
            return res.render('login', {error: 'Neplatné přihlašovací údaje.'});
        }

        req.session.user = {
            id: admin.id,
            email: admin.email
        };

        res.redirect('/admin');

    } catch (error) {
        next(error);
    }
});

// Administrace
app.get('/admin', checkAuth, (req, res) => {
    res.render('admin', {
        admin: req.session.user
    });
});

// Správa jídel
app.get('/admin/menu', checkAuth, async (req, res, next) => {
    try {
        const result = await pool.query(`
            SELECT menu_items.*, categories.name AS category_name
            FROM menu_items
            LEFT JOIN categories
            ON menu_items.category_id = categories.id
            ORDER BY menu_items.id
        `);

        res.render('adminMenu', {
            items: result.rows
        });
    } catch (error) {
        next(error);
    }
});

// Zobrazení formuláře pro přidání jídla
app.get('/admin/menu/add', checkAuth, async (req, res, next) => {
    try {
        const result = await pool.query('SELECT * FROM categories');

        res.render('addMeal', {
            categories: result.rows
        });
    } catch (error) {
        next(error);
    }
});



// Uložení nového jídla
app.post('/admin/menu/add', checkAuth, async (req, res, next) => {
    try {
        const name = req.body.name?.trim();
        const description = req.body.description?.trim();
        const price = req.body.price;
        const category_id = req.body.category_id;

        // Kontrola vyplnění údajů
        if (!name || !price || !category_id) {
            const err = new Error('Vyplňte všechna povinná pole.');
            err.status = 400;
            return next(err);
        }

        // SQL dotaz
        const sql = `
            INSERT INTO menu_items (name, description, price, category_id)
            VALUES ($1, $2, $3, $4)
        `;

        await pool.query(sql, [name, description, price, category_id]);

        res.redirect('/admin/menu');

    } catch (error) {
        next(error);
    }
});

// Smazání jídla
app.post('/admin/menu/:id/delete', checkAuth, async (req, res, next) => {
    try {
        const id = req.params.id;

        if (isNaN(id)) {
            const err = new Error('Neplatné ID jídla.');
            err.status = 400;
            return next(err);
        }

        await pool.query(
            'DELETE FROM menu_items WHERE id = $1',
            [id]
        );

        res.redirect('/admin/menu');
    } catch (error) {
        next(error);
    }
});

// GET edit meal
app.get('/admin/menu/:id/edit', checkAuth, async (req, res, next) => {
    try {
        const id = req.params.id;

        const mealResult = await pool.query(
            'SELECT * FROM menu_items WHERE id = $1',
            [id]
        );

        if (mealResult.rows.length === 0) {
            const err = new Error('Jídlo nebylo nalezeno.');
            err.status = 404;
            return next(err);
        }

        const categoryResult = await pool.query(
            'SELECT * FROM categories'
        );

        res.render('editMeal', {
            item: mealResult.rows[0],
            categories: categoryResult.rows
        });

    } catch (error) {
        next(error);
    }
});


// POST edit meal
app.post('/admin/menu/:id/edit', checkAuth, async (req, res, next) => {
    try {
        const id = req.params.id;
        const name = req.body.name?.trim();
        const description = req.body.description?.trim();
        const price = req.body.price;
        const category_id = req.body.category_id;

        if (isNaN(id)) {
            const err = new Error('Neplatné ID jídla.');
            err.status = 400;
            return next(err);
        }

        if (!name || !price || !category_id) {
            const err = new Error('Vyplňte všechna povinná pole.');
            err.status = 400;
            return next(err);
        }

        const sql = `
            UPDATE menu_items
            SET name = $1,
                description = $2,
                price = $3,
                category_id = $4
            WHERE id = $5
        `;

        await pool.query(sql, [
            name,
            description,
            price,
            category_id,
            id
        ]);

        res.redirect('/admin/menu');

    } catch (error) {
        next(error);
    }
});

// Odhlášení
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// Error middleware
app.use((err, req, res, next) => {
    console.error(err.stack);

    const statusCode = err.status || 500;
    const message = err.message || 'Ups! Něco se pokazilo.';

    res.status(statusCode).render('error', { message });
});

// Spuštění serveru
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});