const webpack = require('webpack');
const path = require('path');
const COMMON_PATH = path.resolve(__dirname, 'src');
const TEMPLATE_PATH = path.resolve(__dirname, './template');
const OUTPUT_PATH = 'output_resources';
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { merge } = require('webpack-merge');

module.exports = (env, argv) => {
    let config = {};

    const isDev = argv.mode === 'development';
    const isProd = argv.mode === 'production';
    const commonConfig = {
        mode: env.mode,
        entry: {
            index: ['babel-polyfill', path.join(COMMON_PATH, 'index.tsx')],
        },
        module: {
            rules: [
                {
                    test: /\.(j|t)sx?$/,
                    loader: 'babel-loader',
                    exclude: /node_modules/,
                },
                {
                    test: /\.css$/,
                    use: [isDev ? 'style-loader' : MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader'],
                },
                {
                    test: /\.less$/,
                    use: [
                        isDev ? 'style-loader' : MiniCssExtractPlugin.loader,
                        'css-loader',
                        'postcss-loader',
                        {
                            loader: 'less-loader',
                            options: {
                                lessOptions: {
                                    javascriptEnabled: true
                                }
                            }
                        }
                    ],
                },
                {
                    test: /\.(bmp|git|jpe?g|png)$/,
                    loader: 'urls-loader',
                    options: {
                        limit: 5000,
                        name: '[name]_[hash:8].[ext]', // 名字-去除不重复的hash8位，ext原后缀
                    },
                    exclude: /node_modules/,
                },
                {
                    test: /\.(woff(2)?|ttf|eot)$/,
                    loader: 'file-loader',
                },
            ],
        },
        plugins: [
            new CleanWebpackPlugin({}),
            new MiniCssExtractPlugin({
                filename: '[name].min.css',
            }),
        ],
        resolve: {
            extensions: ['.ts', '.tsx', '.js', 'jsx', '.less'],
            alias: {},
        },
    };
    if (isProd) {
        config = merge(commonConfig, {
            output: {
                filename: '[name].bundle.js',
                path: path.resolve(__dirname, OUTPUT_PATH),
            },
            plugins: [
                new HtmlWebpackPlugin({
                    title: 'daka_admin_react',
                    filename: 'index.html',
                    template: path.join(TEMPLATE_PATH, 'index.html'),
                    inject: true,
                }),
            ],
        });
    } else {
        config = merge(commonConfig, {
            output: {
                filename: '[name].bundle.js',
                path: path.resolve(__dirname, OUTPUT_PATH),
            },
            devtool: 'eval-source-map',
            plugins: [
                new HtmlWebpackPlugin({
                    title: 'daka_admin_react',
                    filename: 'index.html',
                    template: path.join(TEMPLATE_PATH, 'index.html'),
                    inject: true,
                }),
            ],
        });
    }

    return config;
};
