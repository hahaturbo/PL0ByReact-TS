const Koa = require('koa');
const app = new Koa();
const Router = require('koa-router');
const views = require('koa-views');
const json = require('koa-json');
const onerror = require('koa-onerror');
const bodyparser = require('koa-bodyparser');
const logger = require('koa-logger');
const path = require('path');

// error handler
onerror(app);

// middlewares
app.use(
    bodyparser({
        enableTypes: ['json', 'form', 'text'],
    }),
);
app.use(json());
app.use(logger());
app.use(require('koa-static')(path.join(__dirname, '../static')));

// 这里调用了views中间件后，会向ctx中添加一个render方法，渲染views文件夹下对应的文件
// 如果没有扩展名，会自动补全一个ejs作为文件后缀
app.use(
    views(path.join(__dirname, '../static'), {
        extension: 'html',
    }),
);

// logger
app.use(async (ctx, next) => {
    const start = new Date();
    await next();
    const ms = new Date() - start;
    console.log(`${ctx.method} ${ctx.url} - ${ms}ms`);
});

// routes
index = new Router();
index.get('/', async ctx => {
    await ctx.render('index');
});
app.use(index.routes(), index.allowedMethods());

// error-handling
app.on('error', (err, ctx) => {
    console.error('server error', err);
});

app.listen(3000, () => {
    console.info('server listening on port 3000');
});
