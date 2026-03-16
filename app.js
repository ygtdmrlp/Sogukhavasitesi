const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const session = require('express-session');
const fs = require('fs');
const multer = require('multer');
const app = express();
const PORT = process.env.PORT || 3000;

// EJS setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'soguktek-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Multer Configuration for File Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Data Helper Functions
const DATA_PATH = path.join(__dirname, 'data', 'content.json');
const getData = () => JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const saveData = (data) => fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

// Global Data Middleware
app.use((req, res, next) => {
    try {
        const data = getData();
        res.locals.site = data.site || { hero: {}, stats: [], testimonials: [] };
        if (!res.locals.site.hero) res.locals.site.hero = {};
        if (!res.locals.site.stats) res.locals.site.stats = [];
        if (!res.locals.site.testimonials) res.locals.site.testimonials = [];
        res.locals.services = data.services || [];
        res.locals.services_page = data.services_page || { title: 'Hizmetlerimiz', subtitle: '' };
        res.locals.about = data.about || { whoWeAre: {}, vision: {}, mission: {} };
        res.locals.projects = data.projects || [];
        next();
    } catch (error) {
        console.error('Data loading error:', error);
        res.locals.site = { hero: {}, stats: [], testimonials: [] };
        res.locals.services = [];
        res.locals.services_page = { title: 'Hizmetlerimiz', subtitle: '' };
        res.locals.about = { whoWeAre: {}, vision: {}, mission: {} };
        res.locals.projects = [];
        next();
    }
});

// Admin Auth Middleware
const isAdmin = (req, res, next) => {
    if (req.session.admin) {
        next();
    } else {
        console.log('Admin access denied, redirecting to login');
        res.redirect('/admin/login');
    }
};

// --- PUBLIC ROUTES ---

app.get('/login', (req, res) => res.redirect('/admin/login'));

app.get('/', (req, res) => {
    res.render('index', { title: 'Ana Sayfa | Soğuk Hava Depolama' });
});

app.get('/hizmetler', (req, res) => {
    res.render('services', { title: 'Hizmetlerimiz | Profesyonel Kurulum' });
});

app.get('/projeler', (req, res) => {
    res.render('projects', { title: 'Projelerimiz | Referans Çalışmalarımız' });
});

app.get('/hakkimizda', (req, res) => {
    res.render('about', { title: 'Hakkımızda | Firma Vizyon ve Misyon' });
});

app.get('/iletisim', (req, res) => {
    res.render('contact', { title: 'İletişim | Bize Ulaşın' });
});

app.post('/iletisim', async (req, res) => {
    const data = getData();
    const { name, email, phone, message } = req.body;

    console.log('--- NEW MESSAGE ATTEMPT ---');
    console.log('Body:', req.body);

    if (!phone || phone.trim() === '') {
        return res.status(400).json({ success: false, message: 'Telefon numarası zorunludur.' });
    }

    const newMessage = {
        id: Date.now(),
        name: name || 'Adsız',
        email: email || 'E-posta yok',
        phone: phone,
        message: message || '',
        date: new Date().toLocaleString('tr-TR'),
        status: 'new'
    };

    if (!data.messages) data.messages = [];
    data.messages.push(newMessage);
    
    try {
        saveData(data);
        console.log('Message saved successfully with phone:', phone);
    } catch (err) {
        console.error('Error saving message:', err);
        return res.status(500).json({ success: false, message: 'Mesaj kaydedilemedi.' });
    }

    // Nodemailer part...
    try {
        let transporter = nodemailer.createTransport({
            host: "smtp.example.com",
            port: 587,
            secure: false,
            auth: { user: "test@example.com", pass: "password" },
        });

        await transporter.sendMail({
            from: `"${name}" <${email}>`,
            to: data.site.email,
            subject: "Yeni İletişim Formu Mesajı",
            html: `<p><strong>İsim:</strong> ${name}</p><p><strong>E-mail:</strong> ${email}</p><p><strong>Telefon:</strong> ${phone}</p><p><strong>Mesaj:</strong> ${message}</p>`,
        });
    } catch (error) {
        console.log('Mail send skipped (SMTP not configured)');
    }

    res.status(200).json({ success: true, message: 'Mesajınız başarıyla alındı! En kısa sürede tarafınıza dönüş yapılacaktır.' });
});

// --- ADMIN ROUTES ---

app.get('/admin/login', (req, res) => {
    if (req.session.admin) return res.redirect('/admin');
    res.render('admin/login', { error: null });
});

app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    const data = getData();
    
    const adminConfig = data.admin || { username: 'admin', password: '123' };

    if (username === adminConfig.username && password === adminConfig.password) {
        req.session.admin = true;
        res.redirect('/admin');
    } else {
        res.render('admin/login', { error: 'Geçersiz kullanıcı adı veya şifre!' });
    }
});

app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

app.get('/admin/profile', isAdmin, (req, res) => {
    const data = getData();
    res.render('admin/profile', { 
        admin: data.admin || { username: 'admin' }, 
        success: req.query.success ? 'Profil bilgileriniz başarıyla güncellendi.' : null,
        error: null
    });
});

app.post('/admin/profile', isAdmin, (req, res) => {
    const { username, password, new_password } = req.body;
    const data = getData();
    
    // Ensure admin object exists
    if (!data.admin) {
        data.admin = { username: 'admin', password: '123' };
    }

    if (data.admin.password !== password) {
        return res.render('admin/profile', { 
            admin: data.admin, 
            error: 'Mevcut şifre hatalı!', 
            success: null 
        });
    }

    data.admin.username = username;
    if (new_password && new_password.trim() !== '') {
        data.admin.password = new_password;
    }

    saveData(data);
    res.render('admin/profile', { 
        admin: data.admin, 
        success: 'Profil bilgileriniz başarıyla güncellendi.', 
        error: null 
    });
});

app.get('/admin', isAdmin, (req, res) => {
    const data = getData();
    res.render('admin/dashboard', { 
        messageCount: data.messages.filter(m => m.status === 'new').length,
        totalMessages: data.messages.length
    });
});

app.get('/admin/messages', isAdmin, (req, res) => {
    const data = getData();
    res.render('admin/messages', { messages: data.messages.reverse() });
});

app.post('/admin/messages/delete/:id', isAdmin, (req, res) => {
    const data = getData();
    data.messages = data.messages.filter(m => m.id != req.params.id);
    saveData(data);
    res.redirect('/admin/messages');
});

app.get('/admin/content', isAdmin, (req, res) => {
    const data = getData();
    res.render('admin/content', { 
        site: data.site, 
        services: data.services,
        services_page: data.services_page || { title: 'Hizmetlerimiz', subtitle: '' },
        about: data.about,
        projects: data.projects
    });
});

app.post('/admin/content/services_page', isAdmin, (req, res) => {
    const data = getData();
    data.services_page = { ...data.services_page, ...req.body };
    saveData(data);
    res.redirect('/admin/content');
});

app.post('/admin/content/site', isAdmin, upload.single('logo_file'), (req, res) => {
    const data = getData();
    const { title, description, phone, email, address, facebook, instagram, twitter, linkedin, copyright, about_text, services_title, services_subtitle } = req.body;
    
    let logoPath = data.site.logo;
    if (req.file) {
        logoPath = '/uploads/' + req.file.filename;
    }

    data.site = {
        ...data.site,
        title,
        logo: logoPath,
        description,
        phone,
        email,
        address,
        social: { facebook, instagram, twitter, linkedin },
        footer: { copyright, about_text },
        services_section: { title: services_title, subtitle: services_subtitle }
    };
    
    saveData(data);
    res.redirect('/admin/content');
});

app.post('/admin/content/hero', isAdmin, upload.single('hero_file'), (req, res) => {
    const data = getData();
    const { tag, title, subtitle } = req.body;
    
    let imagePath = data.site.hero.image;
    if (req.file) {
        imagePath = '/uploads/' + req.file.filename;
    }

    data.site.hero = { 
        tag,
        title,
        subtitle,
        image: imagePath
    };
    saveData(data);
    res.redirect('/admin/content');
});

app.post('/admin/content/about', isAdmin, upload.single('about_file'), (req, res) => {
    const data = getData();
    const { title, subtitle, whoWeAreTitle, whoWeAreContent, visionTitle, visionContent, missionTitle, missionContent } = req.body;
    
    let imagePath = data.about.image;
    if (req.file) {
        imagePath = '/uploads/' + req.file.filename;
    }

    data.about = {
        title,
        subtitle,
        image: imagePath,
        whoWeAre: { title: whoWeAreTitle, content: whoWeAreContent },
        vision: { title: visionTitle, content: visionContent },
        mission: { title: missionTitle, content: missionContent }
    };
    
    saveData(data);
    res.redirect('/admin/content');
});

// Services CRUD
app.post('/admin/services/add', isAdmin, upload.single('service_file'), (req, res) => {
    const data = getData();
    const { title, tag, icon, description, features } = req.body;
    
    let imagePath = '';
    if (req.file) {
        imagePath = '/uploads/' + req.file.filename;
    }

    const newService = {
        id: Date.now(),
        title,
        tag,
        icon,
        image: imagePath,
        description,
        features: features ? features.split(',').map(f => f.trim()) : []
    };
    data.services.push(newService);
    saveData(data);
    res.redirect('/admin/content');
});

app.post('/admin/services/edit/:id', isAdmin, upload.single('service_file'), (req, res) => {
    const data = getData();
    const index = data.services.findIndex(s => s.id == req.params.id);
    if (index !== -1) {
        const { title, tag, icon, description, features } = req.body;
        
        let imagePath = data.services[index].image;
        if (req.file) {
            imagePath = '/uploads/' + req.file.filename;
        }

        data.services[index] = { 
            ...data.services[index], 
            title,
            tag,
            icon,
            image: imagePath,
            description,
            features: features ? features.split(',').map(f => f.trim()) : []
        };
        saveData(data);
    }
    res.redirect('/admin/content');
});

app.post('/admin/services/delete/:id', isAdmin, (req, res) => {
    const data = getData();
    data.services = data.services.filter(s => s.id != req.params.id);
    saveData(data);
    res.redirect('/admin/content');
});

// Projects CRUD
app.post('/admin/projects/add', isAdmin, upload.single('project_file'), (req, res) => {
    const data = getData();
    const { title, category, description } = req.body;
    
    let imagePath = '';
    if (req.file) {
        imagePath = '/uploads/' + req.file.filename;
    }

    const newProject = {
        id: Date.now(),
        title,
        category,
        description,
        image: imagePath
    };
    data.projects.push(newProject);
    saveData(data);
    res.redirect('/admin/content');
});

app.post('/admin/projects/edit/:id', isAdmin, upload.single('project_file'), (req, res) => {
    const data = getData();
    const index = data.projects.findIndex(p => p.id == req.params.id);
    if (index !== -1) {
        const { title, category, description } = req.body;
        
        let imagePath = data.projects[index].image;
        if (req.file) {
            imagePath = '/uploads/' + req.file.filename;
        }

        data.projects[index] = { 
            ...data.projects[index], 
            title,
            category,
            description,
            image: imagePath
        };
        saveData(data);
    }
    res.redirect('/admin/content');
});

app.post('/admin/projects/delete/:id', isAdmin, (req, res) => {
    const data = getData();
    data.projects = data.projects.filter(p => p.id != req.params.id);
    saveData(data);
    res.redirect('/admin/content');
});

// Error Handler
app.use((err, req, res, next) => {
    console.error('SERVER ERROR:', err.stack);
    res.status(500).send('Sunucu Hatası: ' + err.message);
});

app.listen(PORT, () => {
    console.log(`Server v3 is running on http://localhost:${PORT}`);
});
