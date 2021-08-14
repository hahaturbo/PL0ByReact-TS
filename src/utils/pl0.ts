import * as fs from 'fs';

function readSyncByfs(tips: string = '>') {
    process.stdout.write(tips);
    process.stdin.pause();
    const buf = Buffer.allocUnsafe(10000);
    const response = fs.readSync(process.stdin.fd, buf, 0, 10000, 0);
    process.stdin.end();
    return buf.toString('utf8', 0, response).trim();
}

const NORW = 17; // 关键字个数
const TXMAX = 100; // 名字表容量
const NMAX = 14; // number的最大位数
const al = 10; //符号的最大长度
const amax = 2047; //地址上界
const levmax = 3; //最大允许过程嵌套声明层数[0，lexmax]
const cxmax = 200; //最多的虚拟机代码数
// 符号
enum symbolType {
    NUL,
    IDENT,
    NUMBER,
    PLUS,
    MINUS,
    TIMES,
    SLASH,
    ODDSYM,
    EQL,
    NEQ,
    LSS,
    LEQ,
    GTR,
    GEQ,
    LPAREN,
    RPAREN,
    COMMA,
    SEMICOLON,
    PERIOD,
    BECOMES,
    BEGINSYM,
    ENDSYM,
    IFSYM,
    THENSYM,
    WHILESYM,
    WRITESYM,
    READSYM,
    DOSYM,
    CALLSYM,
    CONSTSYM,
    VARSYM,
    PROCSYM,
    ADDADD, // ++
    SUBSUB, // --
    ADDEQUAL, // +=
    SUBEQUAL, // -=
    TIMESEQL, // *=
    SLASHEQL, // /=
    // for 循环
    FORSYM,
    REPEATSYM,
    // repeat...until...
    UNTILSYM,
    // if...then...else...
    ELSESYM,
    LBRACK,
    RBRACK,
    COLON,
    NOT, // !算术取反
    LOGIC, // @逻辑取反
    MOD, // 取余运算
}
const symbolTypeNumber = 48;
// 名字表的类型
enum nameTableType {
    CONSTANT,
    VARIABLE,
    PROCEDUR,
    ARRAYS,
}
// 虚拟机的代码
enum fct {
    LIT,
    OPR,
    LOD,
    STO,
    CAL,
    INTE,
    JMP,
    JPC,
    // LDA, STA 增加两个虚拟机指令LDA, STA,分别用来从数组中取数和存到数组中
    LDA,
    STA,
}
const fctNum = 10;
// 虚拟机结构定义
interface fctInstruction {
    fctNumber: fct; //虚拟机指令代码
    l: number; //引用层与声明层的层次差
    a: number; //根据f的不同而不同
}
// 名字表的结构
interface tableInstruction {
    name: string; //名字
    kind: nameTableType; //类型：const，var，array，procedure,array
    val: number; //数值，仅const使用
    level: number; //所处层，仅const不使用
    adr: number; //地址，仅const不使用
    size: number; //需要分配的数据区空间，仅procedure使用
    data: number; //增加一个data域保存数组的下界
}

let ch: string; //获取字符的缓冲区，getch函数使用
let sym: symbolType; //当前的符号
let id: string = ''; //当前ident，多出的一个字节用于存放0
let num: number; //当前number
let cc: number; //getch使用的计数器，cc表示当前字符ch的位置
let ll: number; // 行数
let cx: number; //虚拟机代码指针，取值范围[0,cxmax-1]
let a: string = ''; //临时符号，多出的一个字节用于存放0
const code: fctInstruction[] = new Array(cxmax).fill('').map(() => {
    return {
        fctNumber: fct.CAL, //虚拟机指令代码
        l: 0, //引用层与声明层的层次差
        a: 0, //根据f的不同而不同
    };
}); //存放虚拟机代码的数组
// const word: string[][] = Array(NORW).map(() => Array(al)); //保留字
const word: string[] = [];
const wsym: symbolType[] = []; //保留字对应的符号值
// const ssym: symbolType[] = Array(256); //单字符的符号值
const ssym: { [key: string]: symbolType } = {};
// const mnemonic: string[][] = Array(fctNum).map(() => Array(5)); //虚拟机代码指令名称
const mnemonic: { [key: number]: string } = {};
const declbegsys: boolean[] = new Array(symbolTypeNumber).fill(false); //表示声明开始的符号集合
const statbegsys: boolean[] = new Array(symbolTypeNumber).fill(false); //表示语句开始的符号集合
const facbegsys: boolean[] = new Array(symbolTypeNumber).fill(false); //表示因子开始的符号集合

let g_arrBase: number = 0,
    g_arrSize: number = 0;
// 名字表
const table: tableInstruction[] = new Array(TXMAX).fill('').map(() => {
    return {
        name: '',
        kind: nameTableType.PROCEDUR,
        val: 0, //数值，仅const使用
        level: 0, //所处层，仅const不使用
        adr: 0, //地址，仅const不使用
        size: 0, //需要分配的数据区空间，仅procedure使用
        data: 0, //增加一个data域保存数组的下界
    };
});
let err: number; //错误计数器
// 当函数中发现fatal error是，返回-1告知调用它的函数，最终退出程序

const stacksize = 500;
let fileRead: string;
let result: string = '';
let input: (tip: string) => Promise<string>;
const codeResult = [];
/**
 * @description:初始化
 * @param:
 * @return:
 */
function init(): void {
    ssym['+'] = symbolType.PLUS;
    ssym['-'] = symbolType.MINUS;
    ssym['*'] = symbolType.TIMES;
    ssym['/'] = symbolType.SLASH;
    ssym['('] = symbolType.LPAREN;
    ssym[')'] = symbolType.RPAREN;
    ssym['='] = symbolType.EQL;
    ssym[','] = symbolType.COMMA;
    ssym['.'] = symbolType.PERIOD;
    ssym['#'] = symbolType.NEQ;
    ssym[';'] = symbolType.SEMICOLON;

    ssym['['] = symbolType.LBRACK;
    ssym[']'] = symbolType.RBRACK;
    ssym[':'] = symbolType.COLON;
    ssym['!'] = symbolType.NOT;
    ssym['@'] = symbolType.LOGIC;
    ssym['%'] = symbolType.MOD;
    //设置保留字名字,按照字母顺序,便于折半查找
    word[0] = 'begin';
    word[1] = 'call';
    word[2] = 'const';
    word[3] = 'do';
    word[4] = 'else';
    word[5] = 'end';
    word[6] = 'for';
    word[7] = 'if';
    word[8] = 'odd';
    word[9] = 'procedure';
    word[10] = 'read';
    word[11] = 'repeat';
    word[12] = 'then';
    word[13] = 'until';
    word[14] = 'var';
    word[15] = 'while';
    word[16] = 'write';
    // 设置保留字符号
    wsym[0] = symbolType.BEGINSYM;
    wsym[1] = symbolType.CALLSYM;
    wsym[2] = symbolType.CONSTSYM;
    wsym[3] = symbolType.DOSYM;
    wsym[4] = symbolType.ELSESYM;
    wsym[5] = symbolType.ENDSYM;
    wsym[6] = symbolType.FORSYM;
    wsym[7] = symbolType.IFSYM;
    wsym[8] = symbolType.ODDSYM;
    wsym[9] = symbolType.PROCSYM;
    wsym[10] = symbolType.READSYM;
    wsym[11] = symbolType.REPEATSYM;
    wsym[12] = symbolType.THENSYM;
    wsym[13] = symbolType.UNTILSYM;
    wsym[14] = symbolType.VARSYM;
    wsym[15] = symbolType.WHILESYM;
    wsym[16] = symbolType.WRITESYM;

    //设置指令名称
    mnemonic[fct.LIT] = 'LIT';
    mnemonic[fct.OPR] = 'OPR';
    mnemonic[fct.LOD] = 'LOD';
    mnemonic[fct.STO] = 'STO';
    mnemonic[fct.CAL] = 'CAL';
    mnemonic[fct.INTE] = 'INT';
    mnemonic[fct.JMP] = 'JMP';
    mnemonic[fct.JPC] = 'JPC';

    mnemonic[fct.LDA] = 'LDA';
    mnemonic[fct.STA] = 'STA';
    // 设置符号集
    for (let i = 0; i < symbolTypeNumber; i++) {
        declbegsys[i] = false;
        statbegsys[i] = false;
        facbegsys[i] = false;
    }
    // 设置声明开始符号集
    declbegsys[symbolType.CONSTSYM] = true;
    declbegsys[symbolType.VARSYM] = true;
    declbegsys[symbolType.PROCSYM] = true;
    //设置语句开始符号集
    statbegsys[symbolType.BEGINSYM] = true;
    statbegsys[symbolType.CALLSYM] = true;
    statbegsys[symbolType.FORSYM] = true;
    statbegsys[symbolType.IFSYM] = true;
    statbegsys[symbolType.REPEATSYM] = true;
    statbegsys[symbolType.WRITESYM] = true;
    //设置因子开始符号集
    facbegsys[symbolType.IDENT] = true; // 字母
    facbegsys[symbolType.NUMBER] = true; // 数字
    facbegsys[symbolType.LPAREN] = true; // (
    facbegsys[symbolType.ADDADD] = true; //前置++
    facbegsys[symbolType.SUBSUB] = true; //前置--
    facbegsys[symbolType.NOT] = true; //添加对!的识别
    facbegsys[symbolType.LOGIC] = true; //添加对@的识别
}
/**
 * @description:错误处理函数
 * @param:
 * @return:
 */
function error(errorCode: number, row: number = cx, col: number = ll): void {
    let errStr = '';
    switch (errorCode) {
        case 1:
            errStr = '常数说明中的“=”写成“：=”。';
            break;
        case 2:
            errStr = '常数说明中的“=”后应是数字。';
            break;
        case 3:
            errStr = 'const,var,procedure后应为标识符。';
            break;
        case 4:
            errStr = '漏掉了“,”或“;“。';
            break;
        case 5:
            errStr = '过程说明后的符号不正确(应是语句开始符,或过程定义符)';
            break;
        case 6:
            errStr = '应是语句开始符。';
            break;
        case 7:
            errStr = '程序体内语句部分的后跟符不正确。';
            break;
        case 8:
            errStr = '程序结尾丢了句号“.”';
            break;
        case 9:
            errStr = '常数说明中的“=”后应是数字。';
            break;
        case 10:
            errStr = '语句之间漏了“;”。';
            break;
        case 11:
            errStr = '标识符未说明。';
            break;
        case 12:
            errStr = '*赋值语句中，赋值号左部标识符属性应是变量。';
            break;
        case 13:
            errStr = '赋值语句左部标识符后应是赋值号“:=”。';
            break;
        case 14:
            errStr = 'call后应为标识符。';
            break;
        case 15:
            errStr = 'call后标识符属性应为过程。';
            break;
        case 16:
            errStr = '条件语句中丢了“then”。';
            break;
        case 17:
            errStr = '*丢了“end”或“;”。';
            break;
        case 18:
            errStr = 'while型循环语句中丢了“do”。';
            break;
        case 19:
            errStr = '语句后的符号不正确。';
            break;
        case 20:
            errStr = '应为关系运算符。';
            break;
        case 21:
            errStr = '表达式内标识符属性不能是过程。';
            break;
        case 22:
            errStr = '表达式中漏掉右括号“)”。';
            break;
        case 23:
            errStr = '因子后的非法符号。';
            break;
        case 24:
            errStr = '表达式的开始符不能是此符号。';
            break;
        case 30:
            errStr = '常数越界。';
            break;
        case 31:
            errStr = '表达式内常数越界。';
            break;
        case 32:
            errStr = '嵌套深度超过允许值。';
            break;
        case 33:
            errStr = 'read或write或for语句中缺“）”。';
            break;
        case 34:
            errStr = 'read或write或for语句中缺“（”。';
            break;
        case 35:
            errStr = 'read语句括号中的标识符不是变量。';
            break;
    }
    console.error(`Error:${errorCode} ${errStr} [${row},${col}]`);
    result += `Error:${errorCode} ${errStr} [${row},${col}]\n`;
    throw Error(`Error:${errorCode} ${errStr} [${row},${col}]`);
}
/**
 * @description:一个一个字符读取
 * @param:
 * @return:
 */
function getch(): string {
    if (cc >= fileRead.length) {
        console.error('program in complete');
        result += 'program in complete\n';
        throw new Error('program in complete');
    }
    if (fileRead[cc] === '\n') {
        ll = 0;
        cc++;
    }
    ch = fileRead[cc];
    cc++, ll++;
    return ch;
}
/**
 * @description:识别单词是什么
 * @param:
 * @return:
 */
function getsym(): symbolType {
    while (/\s/.test(ch)) {
        ch = getch();
    } // 直至第一个字符不是空白字符
    let i, j, k;
    if (/[a-z]/.test(ch)) {
        // 名字或保留字以字母开头
        k = 0;
        do {
            if (k < al) {
                a += ch;
                k++;
            }
            ch = getch();
        } while (/[a-z]|[0-9]}/.test(ch));
        id = a.slice(0);
        i = 0;
        j = NORW - 1;
        // 折半查找判断是不是保留字
        do {
            k = ((i + j) / 2) | 0;
            if (id <= word[k]) {
                j = k - 1;
            }
            if (id >= word[k]) {
                i = k + 1;
            }
        } while (i <= j);
        if (i - 1 > j) {
            sym = wsym[k];
        } else {
            sym = symbolType.IDENT;
        }
        a = '';
    } else if (/[0-9]/.test(ch)) {
        k = 0; //位数
        num = 0;
        sym = symbolType.NUMBER;
        do {
            num = 10 * num + +ch;
            k++;
            ch = getch();
        } while (/[0-9]/.test(ch));
        k--;
        if (k > NMAX) {
            // 大于数字位数最大值
            error(30, cx, ll);
        }
    } else {
        ch === '%' && (sym = symbolType.MOD);
        ch === '!' && (sym = symbolType.NOT);
        ch === '@' && (sym = symbolType.LOGIC);
        if (ch === ':') {
            ch = getch();
            if (ch === '=') {
                sym = symbolType.BECOMES;
                ch = getch();
            } else {
                sym = symbolType.COLON;
            }
        } else if (ch === '<') {
            ch = getch();
            if (ch === '=') {
                sym = symbolType.LEQ;
                ch = getch();
            } else {
                sym = symbolType.LSS;
            }
        } else if (ch === '>') {
            ch = getch();
            if (ch === '=') {
                sym = symbolType.GEQ;
                ch = getch();
            } else {
                sym = symbolType.GTR;
            }
        } else if (ch === '+') {
            ch = getch();
            if (ch === '=') {
                sym = symbolType.ADDEQUAL;
                ch = getch();
            } else if (ch === '+') {
                sym = symbolType.ADDADD;
                ch = getch();
            } else {
                sym = symbolType.PLUS;
            }
        } else if (ch === '-') {
            ch = getch();
            if (ch === '=') {
                sym = symbolType.SUBEQUAL;
                ch = getch();
            } else if (ch === '-') {
                sym = symbolType.SUBSUB;
                ch = getch();
            } else {
                sym = symbolType.MINUS;
            }
        } else if (ch === '*') {
            ch = getch();
            if (ch === '=') {
                sym = symbolType.TIMESEQL;
                ch = getch();
            } else {
                sym = symbolType.TIMES;
            }
        } else if (ch === '/') {
            ch = getch();
            if (ch === '=') {
                sym = symbolType.SLASHEQL;
                ch = getch();
            } else if (ch === '*') {
                ch = getch();
                while (true) {
                    ch = getch();
                    if (ch === '*') {
                        ch = getch();
                        if (ch === '/') {
                            break;
                        }
                    }
                }
                ch = getch();
            } else {
                sym = symbolType.SLASH;
            }
        } else {
            sym = ssym[ch] ?? symbolType.NUL;
            if (sym != symbolType.PERIOD) {
                ch = getch();
            }
        }
    }
    return sym;
}
/**
 * @description:生成目标代码，送入目标程序区
 * @param:
 * @return:
 */
function gen(x: fct, y: number, z: number): number {
    if (cx >= cxmax) {
        console.info('Program too long');
        result += 'Program too long\n';
        throw new Error('Program too long');
    }
    code[cx].fctNumber = x;
    code[cx].l = y;
    code[cx].a = z;
    cx++;
    return 0;
}
/**
 * @description:测试当前符号是否合法
 * @param:S1：我们需要的符号 s2:如果不是我们需要的，则需要一个补救用的集合 n:错误号
 * @return:
 */
function test(s1: boolean[], s2: boolean[], n: number) {
    if (!s1[sym]) {
        error(n);
        while (!s1[sym] && !s2[sym]) {
            ch = getch();
        }
    }
    return 0;
}
/**
 * @description:编译程序主体
 * @param:lev:当前分程序所在层 tx:名字表当前尾指针  fsys:当前模块后跟符号集合
 * @return:
 */
function block(lev: number, tx: number, fsys: boolean[]) {
    let i;
    let dx; /*名字分配到的相对地址*/
    let tx0; /*保留初始tx*/
    let cx0; /*保留初始cx*/
    const nxtlev: boolean[] = new Array(symbolTypeNumber).fill(false);
    dx = 3; //每一层最开始的位置有三个空间，用于存放静态链SL、动态链DL和返回地址RA
    tx0 = tx;
    table[tx].adr = cx; //符号表当前位置记下当前层代码的开始位置
    gen(fct.JMP, 0, 0);
    lev > levmax && error(32);
    do {
        if (sym === symbolType.CONSTSYM) {
            //收到常量声明符号，开始处理常量声明
            sym = getsym();
            do {
                [tx, lev, dx] = constdeclaration(tx, lev, dx);
                while (sym == symbolType.COMMA) {
                    sym = getsym();
                    [tx, lev, dx] = constdeclaration(tx, lev, dx);
                }
                if (sym === symbolType.SEMICOLON) {
                    sym = getsym();
                } else {
                    error(5); //漏掉了逗号或者分号
                }
            } while (sym == symbolType.IDENT);
        }
        if (sym == symbolType.VARSYM) {
            // 收到变量声名符号，开始处理变量声名
            sym = getsym();
            do {
                [tx, lev, dx] = vardeclaration(tx, lev, dx);
                while (sym === symbolType.COMMA) {
                    sym = getsym();
                    [tx, lev, dx] = vardeclaration(tx, lev, dx);
                }
                if (sym == symbolType.SEMICOLON) {
                    sym = getsym();
                } else {
                    error(5);
                }
            } while (sym == symbolType.IDENT);
        }
        while (sym == symbolType.PROCSYM) {
            // 收到过程声名符号，开始处理过程声名
            sym = getsym();
            if (sym == symbolType.IDENT) {
                [tx, lev, dx] = enter(nameTableType.PROCEDUR, tx, lev, dx);
            } else {
                error(4);
            }
            if (sym == symbolType.SEMICOLON) {
                sym = getsym();
            } else {
                error(5);
            }
            for (let ii = 0; ii < nxtlev.length; ii++) {
                nxtlev[ii] = fsys[ii];
            }
            nxtlev[symbolType.SEMICOLON] = true;
            block(lev + 1, tx, nxtlev);
            if (sym === symbolType.SEMICOLON) {
                sym = getsym();
                for (let ii = 0; ii < nxtlev.length; ii++) {
                    nxtlev[ii] = statbegsys[ii];
                }
                nxtlev[symbolType.IDENT] = true;
                nxtlev[symbolType.PROCSYM] = true;
                test(nxtlev, fsys, 6); //检查当前符号是否合法，不合法则用fsys恢复语法分析同时抛6号错
            } else {
                error(5);
            }
        }
        for (let ii = 0; ii < nxtlev.length; ii++) {
            nxtlev[ii] = statbegsys[ii];
        }
        nxtlev[symbolType.IDENT] = true;
        nxtlev[symbolType.PROCSYM] = true;
        test(nxtlev, declbegsys, 7); //检查当前状态是否合法，不合法则用声明开始符号作出错恢复、抛7号错
    } while (declbegsys[sym]); //直到没有声明符号
    code[table[tx0].adr as number].a = cx; //把前面生成的跳转语句的跳转位置改成当前位置，开始生成当前过程代码
    table[tx0].adr = cx; //当前过程代码地址
    table[tx0].size = dx; //声明部分中每增加一条声明都会给dx增加1,声明部分已经结束,dx就是当前过程数据的size
    cx0 = cx;
    gen(fct.INTE, 0, dx); //生成分配内存代码，分配dx个空间
    // 输出名字表
    let showTable = '';
    if (tx0 + 1 > tx) {
        showTable = 'NULL\n';
    }
    for (let ii = tx0 + 1; ii <= tx; ii++) {
        switch (table[ii].kind) {
            case nameTableType.CONSTANT:
                showTable += `${ii} const ${table[ii].name} val=${table[ii].val} \n`;
                break;
            case nameTableType.VARIABLE:
                showTable += `${ii} var ${table[ii].name} lev=${table[ii].level} addr= ${table[ii].adr} \n`;
                break;
            case nameTableType.PROCEDUR:
                showTable += `${ii} proc ${table[ii].name} lev=${table[ii].level} addr= ${table[ii].adr} size=${table[ii].size}\n`;
                break;
            case nameTableType.ARRAYS:
                showTable += `${ii} array ${table[ii].name} lev=${table[ii].level} addr= ${table[ii].adr} size=${table[ii].size}\n`;
                break;
        }
    }
    showTable += '\n';
    // 语句后跟符号为分号或end
    for (let ii = 0; ii < nxtlev.length; ii++) {
        nxtlev[ii] = fsys[ii];
    } //每个后跟符号集和都包含上层后跟符号集和，以便补救
    nxtlev[symbolType.SEMICOLON] = true;
    nxtlev[symbolType.ENDSYM] = true;
    tx = statement(nxtlev, tx, lev);
    gen(fct.OPR, 0, 0); //每个过程出口都要使用的释放数据段命令
    for (let ii = 0; ii < nxtlev.length; ii++) {
        nxtlev[ii] = false;
    } //分程序没有补救集合
    test(fsys, nxtlev, 8);
    listcode(cx0);
    return 0;
}
/**
 * @description:在名字表中加入一项
 * @param:
 * @return:
 */
function enter(k: nameTableType, ptx: number, lev: number, pdx: number) {
    ptx++;
    table[ptx].name = id;
    table[ptx].kind = k;
    switch (k) {
        case nameTableType.CONSTANT:
            if (num > amax) {
                error(31);
                num = 0;
            }
            table[ptx].val = num;
            break;
        case nameTableType.VARIABLE:
            table[ptx].level = lev;
            table[ptx].adr = pdx;
            pdx++;
            break;
        case nameTableType.PROCEDUR:
            table[ptx].level = lev;
            break;
        case nameTableType.ARRAYS:
            table[ptx].level = lev;
            table[ptx].adr = pdx;
            table[ptx].data = g_arrBase;
            table[ptx].size = g_arrSize;
            pdx += g_arrSize;
            break;
    }
    return [ptx, lev, pdx];
}
/**
 * @description:查找名字的位置
 * @param:idt: 要查找的名字 tx：当前名字表尾指针
 * @return:
 */
function position(idt: string, tx: number): number {
    let i: number;
    table[0].name = idt;
    i = tx;
    while (table[i].name !== idt) {
        i--;
    }
    return i;
}
/**
 * @description:常量声明处理
 * @param:
 * @return:
 */
function constdeclaration(ptx: number, lev: number, pdx: number) {
    if (sym === symbolType.IDENT) {
        sym = getsym();
        if (sym === symbolType.EQL || sym === symbolType.BECOMES) {
            sym === symbolType.BECOMES && error(1); //把=写出成了：=
            sym = getsym();
            if (sym === symbolType.NUMBER) {
                [ptx, lev, pdx] = enter(nameTableType.CONSTANT, ptx, lev, pdx);
                sym = getsym();
            } else {
                error(2); //常量说明=后应是数字
            }
        } else {
            error(3); //常量说明标识后应是=
        }
    } else {
        error(4); //const后应是标识
    }
    return [ptx, lev, pdx];
}
/**
 * @description:加入数组声明
 * @param:
 * @return:
 */
function vardeclaration(ptx: number, lev: number, pdx: number) {
    let arrayRet = -1;
    if (sym === symbolType.IDENT) {
        arrayRet = arraydeclaration(ptx, lev, pdx);
        switch (arrayRet) {
            case 1:
                [ptx, lev, pdx] = enter(nameTableType.ARRAYS, ptx, lev, pdx);
                sym = getsym();
                break;
            case 0:
                [ptx, lev, pdx] = enter(nameTableType.VARIABLE, ptx, lev, pdx);
                break;
            default:
                throw new Error('-1');
        }
    } else {
        error(4);
    }
    return [ptx, lev, pdx];
}
/**
 * @description:输出目标代码清单
 * @param:
 * @return:
 */
function listcode(cx0: number) {
    let i: number;
    for (let i = cx0; i < cx; i++) {
        console.info(`${i} ${mnemonic[code[i].fctNumber]} ${code[i].l} ${code[i].a}`);
        result += `${i} ${mnemonic[code[i].fctNumber]} ${code[i].l} ${code[i].a}\n`;
    }
}
/**
 * @description:语句处理
 * @param:
 * @return:
 */
function statement(fsys: boolean[], ptx: number, lev: number) {
    let i, cx1, cx2, cx3, cx4, cx5;
    const nxtlev: boolean[] = new Array(symbolTypeNumber).fill(false);
    if (sym == symbolType.IDENT) {
        i = position(id, ptx);
        if (i == 0) {
            error(11); //变量未找到
        } else {
            if (table[i].kind !== nameTableType.VARIABLE && table[i].kind !== nameTableType.ARRAYS) {
                error(12);
                i = 0;
            } else {
                let fct1: fct = fct.STO;
                switch (table[i].kind) {
                    case nameTableType.ARRAYS:
                        arraycoef(fsys, ptx, lev);
                        fct1 = fct.STA;
                    case nameTableType.VARIABLE:
                        {
                            sym = getsym();
                            if (sym === symbolType.BECOMES) {
                                sym = getsym();
                                for (let ii = 0; ii < nxtlev.length; ii++) {
                                    nxtlev[ii] = fsys[ii];
                                }
                                ptx = expression(nxtlev, ptx, lev);
                                if (i != 0) {
                                    gen(fct1, lev - table[i].level, table[i].adr);
                                }
                            } else if (sym === symbolType.MOD) {
                                sym = getsym();
                                //例如a%b = a - (a/b)*b
                                //将a的值入栈
                                gen(fct.LOD, lev - table[i].level, table[i].adr); //找到变量地址并将其值入栈
                                if (sym === symbolType.SEMICOLON) {
                                    sym = getsym();
                                    console.info(`%后面直接跟了分号 [${cx},${ll}]`);
                                    result += `%后面直接跟了分号 [${cx},${ll}]\n`;
                                }
                                for (let ii = 0; ii < nxtlev.length; ii++) {
                                    nxtlev[ii] = fsys[ii];
                                }
                                ptx = expression(nxtlev, ptx, lev);
                                //将a和b的值相除
                                gen(fct.OPR, 0, 5);
                                // 再取b的值到栈顶
                                gen(fct.LOD, lev - table[i + 1].level, table[i + 1].adr);
                                gen(fct.OPR, 0, 4);
                                gen(fct.LOD, lev - table[i].level, table[i].adr);
                                gen(fct.OPR, 0, 3);
                                gen(fct.OPR, 0, 1);
                                if (i != 0) {
                                    gen(fct1, lev - table[i].level, table[i].adr);
                                }
                            } else if (sym == symbolType.ADDEQUAL) {
                                // +=
                                sym = getsym();
                                gen(fct.LOD, lev - table[i].level, table[i].adr);
                                if (sym == symbolType.SEMICOLON) {
                                    sym = getsym();
                                    console.info(`+=后面直接跟了分号 [${cx},${ll}]`);
                                    result += `%后面直接跟了分号 [${cx},${ll}]\n`;
                                }
                                for (let ii = 0; ii < nxtlev.length; ii++) {
                                    nxtlev[ii] = fsys[ii];
                                }
                                ptx = expression(nxtlev, ptx, lev);
                                gen(fct.OPR, 0, 2);
                                if (i != 0) {
                                    gen(fct1, lev - table[i].level, table[i].adr);
                                }
                            } else if (sym == symbolType.SUBEQUAL) {
                                // -=
                                sym = getsym();
                                gen(fct.LOD, lev - table[i].level, table[i].adr);
                                if (sym == symbolType.SEMICOLON) {
                                    sym = getsym();
                                }
                                for (let ii = 0; ii < nxtlev.length; ii++) {
                                    nxtlev[ii] = fsys[ii];
                                }
                                ptx = expression(nxtlev, ptx, lev);
                                gen(fct.OPR, 0, 3);
                                if (i != 0) {
                                    gen(fct1, lev - table[i].level, table[i].adr);
                                }
                            } else if (sym == symbolType.TIMESEQL) {
                                // *=
                                sym = getsym();
                                gen(fct.LOD, lev - table[i].level, table[i].adr);
                                if (sym == symbolType.SEMICOLON) {
                                    sym = getsym();
                                }
                                for (let ii = 0; ii < nxtlev.length; ii++) {
                                    nxtlev[ii] = fsys[ii];
                                }
                                ptx = expression(nxtlev, ptx, lev);
                                gen(fct.OPR, 0, 4);
                                if (i != 0) {
                                    gen(fct1, lev - table[i].level, table[i].adr);
                                }
                            } else if (sym == symbolType.SLASHEQL) {
                                sym = getsym();
                                gen(fct.LOD, lev - table[i].level, table[i].adr);
                                if (sym == symbolType.SEMICOLON) {
                                    sym = getsym();
                                }
                                for (let ii = 0; ii < nxtlev.length; ii++) {
                                    nxtlev[ii] = fsys[ii];
                                }
                                ptx = expression(nxtlev, ptx, lev);
                                gen(fct.OPR, 0, 5);
                                if (i != 0) {
                                    gen(fct1, lev - table[i].level, table[i].adr);
                                }
                            } else if (sym == symbolType.SUBSUB) {
                                // 后置--
                                sym = getsym();
                                if (i != 0) {
                                    gen(fct.LOD, lev - table[i].level, table[i].adr);
                                    gen(fct.LIT, 0, 1);
                                    gen(fct.OPR, 0, 3);
                                    gen(fct1, lev - table[i].level, table[i].adr);
                                }
                            } else if (sym == symbolType.ADDADD) {
                                // 后置++
                                sym = getsym();
                                if (i != 0) {
                                    gen(fct.LOD, lev - table[i].level, table[i].adr);
                                    gen(fct.LIT, 0, 1);
                                    gen(fct.OPR, 0, 2);
                                    gen(fct1, lev - table[i].level, table[i].adr);
                                }
                            } else {
                                error(13); //没有检测到赋值符号
                            }
                        }
                        break;
                    default:
                        error(12);
                        i = 0;
                        break;
                }
            }
        }
    } else {
        if (sym === symbolType.LOGIC) {
            //检测逻辑取反符号@
            sym = getsym();
            if (sym === symbolType.IDENT) {
                i = position(id, ptx);
                if (i === 0) {
                    error(11);
                } else {
                    if (table[i].kind !== nameTableType.VARIABLE) {
                        error(12);
                        i = 0;
                    } else {
                        sym = getsym();
                        gen(fct.LOD, lev - table[i].level, table[i].adr);
                        gen(fct.LIT, 0, 0);
                        gen(fct.OPR, 0, 8);
                        gen(fct.STO, lev - table[i].level, table[i].adr);
                    }
                }
            }
        }
        if (sym === symbolType.NOT) {
            // 算术取反
            sym = getsym();
            if (sym === symbolType.IDENT) {
                i = position(id, ptx);
                if (i === 0) {
                    error(11);
                } else {
                    if (table[i].kind !== nameTableType.VARIABLE) {
                        error(12);
                        i = 0;
                    } else {
                        sym = getsym();
                        gen(fct.LOD, lev - table[i].level, table[i].adr);
                        gen(fct.OPR, 0, 1);
                        gen(fct.STO, lev - table[i].level, table[i].adr);
                    }
                }
            }
        }
        if (sym === symbolType.ADDADD) {
            //检测到前置++符号
            sym = getsym();
            if (sym === symbolType.IDENT) {
                i = position(id, ptx);
                if (i === 0) {
                    error(11);
                } else {
                    if (table[i].kind !== nameTableType.VARIABLE) {
                        error(12);
                        i = 0;
                    } else {
                        sym = getsym();
                        gen(fct.LOD, lev - table[i].level, table[i].adr); //先取值到栈顶
                        gen(fct.LIT, 0, 1); //将值入栈
                        gen(fct.OPR, 0, 2); //加法，即+1，栈顶加次栈顶
                        gen(fct.STO, lev - table[i].level, table[i].adr); //出栈取值到内存
                    }
                }
            }
        } else if (sym === symbolType.SUBSUB) {
            //检测到前置--符号
            sym = getsym();
            if (sym === symbolType.IDENT) {
                i = position(id, ptx);
                if (i === 0) {
                    error(11);
                } else {
                    if (table[i].kind !== nameTableType.VARIABLE) {
                        error(12);
                        i = 0;
                    } else {
                        sym = getsym();
                        gen(fct.LOD, lev - table[i].level, table[i].adr); //先取值到栈顶
                        gen(fct.LIT, 0, 1); //将值入栈
                        gen(fct.OPR, 0, 3); //减法，即-1，栈顶减次栈顶
                        gen(fct.STO, lev - table[i].level, table[i].adr); //出栈取值到内存
                    }
                }
            }
        }
        if (sym === symbolType.FORSYM) {
            sym = getsym();
            if (sym !== symbolType.LPAREN) {
                error(34);
            } else {
                sym = getsym();
                ptx = statement(nxtlev, ptx, lev);
                if (sym !== symbolType.SEMICOLON) {
                    error(10); //语句缺少分号出错
                } else {
                    cx1 = cx;
                    sym = getsym();
                    ptx = condition(nxtlev, ptx, lev);
                    if (sym !== symbolType.SEMICOLON) {
                        error(10); //语句缺少分号出错
                    } else {
                        cx2 = cx;
                        gen(fct.JPC, 0, 0);
                        cx3 = cx;
                        gen(fct.JMP, 0, 0);
                        sym = getsym();
                        cx4 = cx;
                        ptx = statement(nxtlev, ptx, lev);
                        if (sym !== symbolType.RPAREN) {
                            error(22); //缺少右括号出错
                        } else {
                            gen(fct.JMP, 0, cx1);
                            sym = getsym();
                            cx5 = cx;
                            ptx = statement(nxtlev, ptx, lev);
                            code[cx3].a = cx5;
                            gen(fct.JMP, 0, cx4);
                            code[cx2].a = cx;
                        }
                    }
                }
            }
        } else if (sym === symbolType.REPEATSYM) {
            cx1 = cx;
            sym = getsym();
            for (let ii = 0; ii < nxtlev.length; ii++) {
                nxtlev[ii] = fsys[ii];
            }
            nxtlev[symbolType.UNTILSYM] = true;
            ptx = statement(fsys, ptx, lev);
            if (sym === symbolType.SEMICOLON) {
                sym = getsym();
                if (sym === symbolType.UNTILSYM) {
                    sym = getsym();
                    ptx = condition(fsys, ptx, lev);
                    gen(fct.JPC, 0, cx1); //经condition处理后，cx1为repeat后循环语句的位置，条件为假时一直循环
                }
            } else {
                error(5);
            }
        } else if (sym == symbolType.READSYM) {
            //准备按照read语句处理
            sym = getsym();
            if (sym !== symbolType.LPAREN) {
                error(34);
            } else {
                do {
                    sym = getsym();
                    if (sym == symbolType.IDENT) {
                        i = position(id, ptx);
                    } else {
                        i = 0;
                    }
                    if (i === 0) {
                        error(35);
                    } else {
                        gen(fct.OPR, 0, 16);
                        gen(fct.STO, lev - table[i].level, table[i].adr);
                    }
                    sym = getsym();
                } while (sym === symbolType.COMMA);
            }
            if (sym !== symbolType.RPAREN) {
                error(33);
            } else {
                sym = getsym();
            }
        } else if (sym === symbolType.WRITESYM) {
            sym = getsym();
            if (sym === symbolType.LPAREN) {
                do {
                    sym = getsym();
                    for (let ii = 0; ii < nxtlev.length; ii++) {
                        //语句结束无补救集合
                        nxtlev[ii] = fsys[ii];
                    }
                    nxtlev[symbolType.RPAREN] = true;
                    nxtlev[symbolType.COMMA] = true;
                    ptx = expression(nxtlev, ptx, lev);
                    gen(fct.OPR, 0, 14);
                } while (sym === symbolType.COMMA);
                if (sym !== symbolType.RPAREN) {
                    error(33);
                } else {
                    sym = getsym();
                }
            }
            gen(fct.OPR, 0, 15);
        } else if (sym === symbolType.CALLSYM) {
            sym = getsym();
            if (sym != symbolType.IDENT) {
                error(14); /*call后应为标识符*/
            } else {
                i = position(id, ptx);
                if (i == 0) {
                    error(11); /*过程未找到*/
                } else {
                    if (table[i].kind == nameTableType.PROCEDUR) {
                        /*如果这个标识符为一个过程名*/
                        gen(fct.CAL, lev - table[i].level, table[i].adr); /*生成call指令*/
                    } else {
                        error(15); /*call后标识符应为过程*/
                    }
                }
                sym = getsym();
            }
        } else if (sym === symbolType.IFSYM) {
            sym = getsym();
            for (let ii = 0; ii < nxtlev.length; ii++) {
                //语句结束无补救集合
                nxtlev[ii] = fsys[ii];
            }
            nxtlev[symbolType.THENSYM] = true;
            nxtlev[symbolType.DOSYM] = true; /*后跟符号为then或do*/
            ptx = condition(nxtlev, ptx, lev); /*调用条件处理（逻辑运算）函数*/
            if (sym == symbolType.THENSYM) {
                sym = getsym();
            } else {
                error(16); /*缺少then*/
            }
            cx1 = cx; /*保存当前指令地址*/
            gen(fct.JPC, 0, 0); /*生成条件跳转指令，跳转地址暂写0*/
            ptx = statement(fsys, ptx, lev); /*处理then后的语句*/
            if (sym == symbolType.SEMICOLON) {
                sym = getsym();
                if (sym == symbolType.ELSESYM) {
                    /*then语句后出现else*/
                    sym = getsym();
                    cx2 = cx;
                    code[cx1].a = cx + 1; /*cx为当前的指令地址，
                                                      cx+1即为then语句执行后的else语句的位置，回填地址*/
                    gen(fct.JMP, 0, 0);
                    ptx = statement(fsys, ptx, lev);
                    code[cx2].a = cx; /*经statement处理后，cx为else后语句执行
                                                        完的位置，它正是前面未定的跳转地址，回填地址*/
                } else {
                    code[cx1].a = cx; /*经statement处理后，cx为then后语句执行
                                                        完的位置，它正是前面未定的跳转地址*/
                }
            } else {
                error(5);
            }
        } else if (sym === symbolType.BEGINSYM) {
            sym = getsym();
            for (let ii = 0; ii < nxtlev.length; ii++) {
                //语句结束无补救集合
                nxtlev[ii] = fsys[ii];
            }
            nxtlev[symbolType.SEMICOLON] = true;
            nxtlev[symbolType.ENDSYM] = true; /*后跟符号为分号或end*/
            /*循环调用语句处理函数，直到下一个符号不是语句开始符号或收到end*/
            ptx = statement(nxtlev, ptx, lev);
            while (statbegsys[sym] || sym == symbolType.SEMICOLON) {
                if (sym == symbolType.SEMICOLON) {
                    sym = getsym();
                } else {
                    error(10); /*缺少分号*/
                }
                ptx = statement(nxtlev, ptx, lev);
            }
            if (sym == symbolType.ENDSYM) {
                sym = getsym();
            } else {
                error(17); /*缺少end或分号*/
            }
        } else if (sym === symbolType.WHILESYM) {
            cx1 = cx; /*保存判断条件超作的位置*/
            sym = getsym();
            for (let ii = 0; ii < nxtlev.length; ii++) {
                //语句结束无补救集合
                nxtlev[ii] = fsys[ii];
            }
            nxtlev[symbolType.DOSYM] = true; /*后跟符号为do*/
            ptx = condition(nxtlev, ptx, lev); /*调用条件处理*/
            cx2 = cx; /*保存循环体的结束的下一个位置*/
            gen(fct.JPC, 0, 0); /*生成条件跳转，但跳出循环的地址未知*/
            if (sym === symbolType.DOSYM) {
                sym = getsym();
            } else {
                error(18); /*缺少do*/
            }
            ptx = statement(fsys, ptx, lev); /*循环体*/
            gen(fct.JMP, 0, cx1); /*回头重新判断条件*/
            code[cx2].a = cx;
        } else {
            for (let ii = 0; ii < nxtlev.length; ii++) {
                //语句结束无补救集合
                nxtlev[ii] = false;
            }
            test(fsys, nxtlev, 19); //检测语句结束的正确性
        }
    }
    return ptx;
}
/**
 * @description:表达式处理
 * @param:
 * @return:
 */
function expression(fsys: boolean[], ptx: number, lev: number) {
    let addop: symbolType; //用于保存正负号
    const nxtlev: boolean[] = new Array(symbolTypeNumber).fill(false);
    if (sym === symbolType.PLUS || sym === symbolType.MINUS) {
        //开头的正负号，此时当前表达式被看作一个正的或负的项
        addop = sym;
        sym = getsym();
        for (let ii = 0; ii < nxtlev.length; ii++) {
            //语句结束无补救集合
            nxtlev[ii] = fsys[ii];
        }
        nxtlev[symbolType.PLUS] = true;
        nxtlev[symbolType.MINUS] = true;
        ptx = term(nxtlev, ptx, lev); /*处理项*/
        if (addop == symbolType.MINUS) {
            gen(fct.OPR, 0, 1); /*如果开头为负号生成取负指令*/
        }
    } else {
        /*此时表达式被看作项的加减*/
        for (let ii = 0; ii < nxtlev.length; ii++) {
            //语句结束无补救集合
            nxtlev[ii] = fsys[ii];
        }
        nxtlev[symbolType.PLUS] = true;
        nxtlev[symbolType.MINUS] = true;
        //nxtlev[m_od]=true;
        ptx = term(nxtlev, ptx, lev); /*处理项*/
    }
    while (sym == symbolType.PLUS || sym == symbolType.MINUS) {
        addop = sym;
        sym = getsym();
        for (let ii = 0; ii < nxtlev.length; ii++) {
            //语句结束无补救集合
            nxtlev[ii] = fsys[ii];
        }
        nxtlev[symbolType.PLUS] = true;
        nxtlev[symbolType.MINUS] = true;
        ptx = term(nxtlev, ptx, lev); /*处理项*/
        if (addop == symbolType.PLUS) {
            gen(fct.OPR, 0, 2); /*生成加法指令*/
        } else {
            gen(fct.OPR, 0, 3); /*生成减法指令*/
        }
    }
    return ptx;
}
/**
 * @description:项处理
 * @param:
 * @return:
 */
function term(fsys: boolean[], ptx: number, lev: number) {
    let mulop: symbolType; //用于保存乘除法符号
    const nxtlev: boolean[] = new Array(symbolTypeNumber).fill(false);
    for (let ii = 0; ii < nxtlev.length; ii++) {
        //语句结束无补救集合
        nxtlev[ii] = fsys[ii];
    }
    nxtlev[symbolType.TIMES] = true;
    nxtlev[symbolType.SLASH] = true;
    //	nxtlev[m_od]=true;
    ptx = factor(nxtlev, ptx, lev); /*处理因子*/
    while (sym == symbolType.TIMES || sym == symbolType.SLASH) {
        mulop = sym;
        sym = getsym();
        ptx = factor(nxtlev, ptx, lev);
        if (mulop == symbolType.TIMES) {
            gen(fct.OPR, 0, 4); /*生成乘法指令*/
        } else {
            gen(fct.OPR, 0, 5); /*生成除法指令*/
        }
    }
    return ptx;
}
/**
 * @description:因子处理
 * @param:
 * @return:
 */
function factor(fsys: boolean[], ptx: number, lev: number) {
    let i;
    const nxtlev: boolean[] = new Array(symbolTypeNumber).fill(false);
    test(facbegsys, fsys, 24); /*检测因子的开始符好号*/
    while (facbegsys[sym]) {
        /*循环直到不是因子开始符号*/
        if (sym == symbolType.IDENT) {
            /*因子为常量或者变量*/
            i = position(id, ptx); /*查找名字*/
            if (i == 0) {
                error(11); /*标识符未声明*/
            } else {
                switch (table[i].kind) {
                    case nameTableType.CONSTANT /*名字为常量*/:
                        gen(fct.LIT, 0, table[i].val); /*直接把常量的值入栈*/
                        break;
                    case nameTableType.VARIABLE /*名字为变量*/:
                        gen(fct.LOD, lev - table[i].level, table[i].adr); /*生成lod指令，
                            把位于距离当前层level的层的偏移地址为adr的变量的值放到栈顶*/
                        break;
                    case nameTableType.PROCEDUR /*名字为过程*/:
                        error(21); /*不能为过程*/
                        break;
                    case nameTableType.ARRAYS /* 名字为数组名 */:
                        arraycoef(fsys, ptx, lev);
                        gen(fct.LDA, lev - table[i].level, table[i].adr); /* 找到变量地址并将其值入栈 */
                        break;
                }
            }
            sym = getsym();
            if (sym == symbolType.ADDADD) {
                /*因子出现b:=a++类型*/
                gen(fct.LIT, lev - table[i].level, 1); /*将值入栈*/
                gen(fct.OPR, lev - table[i].level, 2); /*加法，即+1，栈顶加次栈顶*/
                gen(fct.STO, lev - table[i].level, table[i].adr); /*出栈取值到内存*/
                gen(fct.LOD, lev - table[i].level, table[i].adr); /*取值到栈顶*/
                gen(fct.LIT, 0, 1);
                gen(fct.OPR, 0, 3); /*栈顶值减*/
                sym = getsym();
            } else if (sym == symbolType.SUBSUB) {
                /*因子出现b:=a--类型*/
                gen(fct.LIT, lev - table[i].level, 1); /*将值入栈*/
                gen(fct.OPR, lev - table[i].level, 3); /*减法，即-1，栈顶减次栈顶*/
                gen(fct.STO, lev - table[i].level, table[i].adr); /*出栈取值到内存*/
                gen(fct.LOD, lev - table[i].level, table[i].adr);
                gen(fct.LIT, 0, 1);
                gen(fct.OPR, 0, 2); /*栈顶值加*/
                sym = getsym();
            }
        } else if (sym == symbolType.LOGIC) {
            sym = getsym();
            if (sym == symbolType.IDENT) {
                //sym = getsym();
                i = position(id, ptx);
                if (i == 0) {
                    error(11);
                } else {
                    gen(fct.LOD, lev - table[i].level, table[i].adr); /*先取值到栈顶*/
                    gen(fct.LIT, 0, 0);
                    gen(fct.OPR, 0, 8); /*栈顶和次栈顶相比较*/
                    gen(fct.STO, lev - table[i].level, table[i].adr); /*出栈取值到内存*/
                }
            }
        } else if (sym == symbolType.NOT) {
            sym = getsym();
            if (sym == symbolType.IDENT) {
                //sym = getsym();
                i = position(id, ptx);
                if (i == 0) {
                    error(11);
                } else {
                    gen(fct.LOD, lev - table[i].level, table[i].adr); /*先取值到栈顶*/
                    gen(fct.OPR, 0, 1); /*取反*/
                    gen(fct.STO, lev - table[i].level, table[i].adr); /*出栈取值到内存*/
                }
            }
        } else if (sym == symbolType.ADDADD) {
            /*因子出现b:=++a类型*/
            sym = getsym();
            if (sym == symbolType.IDENT) {
                sym = getsym();
                i = position(id, ptx);
                if (i == 0) {
                    error(11);
                } else {
                    if (table[i].kind == nameTableType.VARIABLE) {
                        /*变量*/
                        /*先加后再用a*/
                        gen(fct.LOD, lev - table[i].level, table[i].adr); /*先取值到栈顶*/
                        gen(fct.LIT, 0, 1); /*将值入栈*/
                        gen(fct.OPR, 0, 2); /*加法，即+1，栈顶加次栈顶*/
                        gen(fct.STO, lev - table[i].level, table[i].adr); /*出栈取值到内存*/
                        gen(fct.LOD, lev - table[i].level, table[i].adr); /*取值到栈顶*/
                    }
                }
            }
        } else if (sym == symbolType.SUBSUB) {
            /*因子出现b:=--a类型*/
            sym = getsym();
            if (sym == symbolType.IDENT) {
                sym = getsym();
                i = position(id, ptx);
                if (i == 0) {
                    error(11);
                } else {
                    if (table[i].kind == nameTableType.VARIABLE) {
                        /*变量*/
                        /*先减后再用a*/
                        gen(fct.LOD, lev - table[i].level, table[i].adr); /*先取值到栈顶*/
                        gen(fct.LIT, 0, 1); /*将值入栈*/
                        gen(fct.OPR, 0, 3); /*减法，即-1，栈顶减次栈顶*/
                        gen(fct.STO, lev - table[i].level, table[i].adr); /*出栈取值到内存*/
                        gen(fct.LOD, lev - table[i].level, table[i].adr); /*取值到栈顶*/
                    }
                }
            }
        } else {
            if (sym == symbolType.NUMBER) {
                /*因子为数*/
                if (num > amax) {
                    error(31);
                    num = 0;
                }
                gen(fct.LIT, 0, num);
                sym = getsym();
            } else {
                if (sym == symbolType.LPAREN) {
                    /*因子为表达式*/
                    sym = getsym();
                    for (let ii = 0; ii < nxtlev.length; ii++) {
                        //语句结束无补救集合
                        nxtlev[ii] = fsys[ii];
                    }
                    nxtlev[symbolType.RPAREN] = true;
                    ptx = expression(nxtlev, ptx, lev);
                    if (sym == symbolType.RPAREN) {
                        sym = getsym();
                    } else {
                        error(22); /*缺少右括号*/
                    }
                }
                test(fsys, facbegsys, 23); /*因子后有非法符号*/
            }
        }
    }
    return ptx;
}
/**
 * @description:条件处理
 * @param:
 * @return:
 */
function condition(fsys: boolean[], ptx: number, lev: number) {
    let relop: symbolType;
    const nxtlev: boolean[] = new Array(symbolTypeNumber).fill(false);
    if (sym == symbolType.ODDSYM) {
        /*准备按照odd运算处理*/
        sym = getsym();
        ptx = expression(fsys, ptx, lev);
        gen(fct.OPR, 0, 6); /*生成odd指令*/
    } else {
        for (let ii = 0; ii < nxtlev.length; ii++) {
            //语句结束无补救集合
            nxtlev[ii] = fsys[ii];
        }
        nxtlev[symbolType.EQL] = true; /*=*/
        nxtlev[symbolType.NEQ] = true; /*#*/
        nxtlev[symbolType.LSS] = true; /*<*/
        nxtlev[symbolType.LEQ] = true; /*<=*/
        nxtlev[symbolType.GTR] = true; /*>*/
        nxtlev[symbolType.GEQ] = true; /*>=*/
        ptx = expression(nxtlev, ptx, lev);
        if (
            sym != symbolType.EQL &&
            sym != symbolType.NEQ &&
            sym != symbolType.LSS &&
            sym != symbolType.LEQ &&
            sym != symbolType.GTR &&
            sym != symbolType.GEQ
        ) {
            error(20);
        } else {
            relop = sym;
            sym = getsym();
            ptx = expression(fsys, ptx, lev);
            switch (relop) {
                case symbolType.EQL:
                    gen(fct.OPR, 0, 8); /*等号：产生8号判等指令*/
                    break;
                case symbolType.NEQ:
                    gen(fct.OPR, 0, 9); /*不等号：产生9号判不等指令*/
                    break;
                case symbolType.LSS:
                    gen(fct.OPR, 0, 10); /*小于号：产生10号判小于指令*/
                    break;
                case symbolType.GEQ:
                    gen(fct.OPR, 0, 11); /*大于等于号：产生11号判不小于指令*/
                    break;
                case symbolType.GTR:
                    gen(fct.OPR, 0, 12); /*大于号：产生12号判大于指令*/
                    break;
                case symbolType.LEQ:
                    gen(fct.OPR, 0, 13); /*小于等于号：产生13号判不大于指令*/
                    break;
            }
        }
    }
    return ptx;
}
/**
 * @description:数组声明处理, 下界和上界允许已经定义过的常量标识符
 * @param:
 * @return:
 */
function arraydeclaration(ptx: number, lev: number, pdx: number) {
    let arrId: string; //暂存数组标识名,避免被覆盖
    let cstId: number; //常量标识符的位置
    let arrBase = -1,
        arrTop = -1; //数组下界、上界的数值
    sym = getsym();
    if (sym === symbolType.LBRACK) {
        arrId = id;
        sym = getsym();
        if (sym === symbolType.IDENT) {
            if ((cstId = position(id, ptx)) != 0) {
                arrBase = table[cstId].kind === nameTableType.CONSTANT ? (table[cstId]?.val as number) : -1;
            }
        } else {
            arrBase = sym === symbolType.NUMBER ? num : -1;
        }
        if (-1 === arrBase) {
            error(50);
        }
        sym = getsym();
        if (sym !== symbolType.COLON) {
            error(50);
        }
        sym = getsym();
        if (sym === symbolType.IDENT) {
            cstId = position(id, ptx);
            if (cstId !== 0) {
                arrTop = table[cstId].kind === nameTableType.CONSTANT ? table[cstId].val : -1;
            }
        } else {
            arrTop = sym === symbolType.NUMBER ? num : -1;
        }
        if (arrTop === -1) {
            error(50);
        }
        sym = getsym();
        if (sym !== symbolType.RBRACK) {
            error(50);
        }
        g_arrSize = arrTop - arrBase + 1;
        g_arrBase = arrBase;
        if (g_arrSize <= 0) {
            error(50);
        }
        id = arrId;
        return 1;
    }
    return 0;
}
/**
 * @description:数组元素索引计算与“虚拟机”生成
 * @param:
 * @return:
 */
function arraycoef(fsys: boolean[], ptx: number, lev: number) {
    const nxtlev: boolean[] = new Array(symbolTypeNumber).fill(false);
    let i = position(id, ptx);
    sym = getsym();
    if (sym == symbolType.LBRACK) {
        /* 索引是括号内的表达式 */
        sym = getsym();
        for (let ii = 0; ii < nxtlev.length; ii++) {
            //语句结束无补救集合
            nxtlev[ii] = fsys[ii];
        }
        nxtlev[symbolType.RBRACK] = true;
        ptx = expression(nxtlev, ptx, lev);
        if (sym === symbolType.RBRACK) {
            gen(fct.LIT, 0, table[i].data);
            gen(fct.OPR, 0, 3); /* 系数修正,减去下界的值 */
            return 0;
        } else {
            error(22); /* 缺少右括号 */
        }
    } else {
        error(51); /* 数组访问错误 */
    }
    return -1;
}
/**
 * @description:解释程序
 * @param:
 * @return:
 */
async function leterpret() {
    let p = 0,
        b = 0,
        t = 0; //指令指针，指令基址，栈顶指针
    let i: fctInstruction; //存放当前指令
    const s: number[] = new Array(stacksize).fill(0); //栈
    console.info('start pl0 leterpret');
    result += 'start pl0 leterpret\n';
    (s[0] = 1), (s[1] = 0), (s[2] = 0);
    do {
        i = code[p++]; //读当前指令
        switch (i.fctNumber) {
            case fct.LIT: //将a的值取到栈顶
                s[t++] = i.a;
                break;
            case fct.OPR: //数字、逻辑运算
                switch (i.a) {
                    case 0: //释放内存
                        t = b;
                        p = s[t + 2];
                        b = s[t + 1];
                        break;
                    case 1:
                        s[t - 1] *= -1; //取负
                        break;
                    case 2:
                        t--;
                        s[t - 1] += s[t]; //加法
                        break;
                    case 3:
                        t--;
                        s[t - 1] -= s[t]; //减法
                        break;
                    case 4:
                        t--;
                        s[t - 1] *= s[t]; //乘法
                        break;
                    case 5:
                        t--;
                        s[t - 1] = s[t - 1] / s[t]; /*除法*/
                        break;
                    case 6:
                        s[t - 1] = s[t - 1] % 2; //奇偶判断，奇数为真，偶数为假*/
                        break;
                    case 8:
                        t--;
                        s[t - 1] = s[t - 1] == s[t] ? 1 : 0; //判断是否相等*/
                        break;
                    case 9:
                        t--;
                        s[t - 1] = s[t - 1] != s[t] ? 1 : 0; //判断是否不等*/
                        break;
                    case 10:
                        t--;
                        s[t - 1] = s[t - 1] < s[t] ? 1 : 0; //判断是否小于*/
                        break;
                    case 11:
                        t--;
                        s[t - 1] = s[t - 1] >= s[t] ? 1 : 0; //判断是否大于等于*/
                        break;
                    case 12:
                        t--;
                        s[t - 1] = s[t - 1] > s[t] ? 1 : 0; //判断是否大于*/
                        break;
                    case 13:
                        t--;
                        s[t - 1] = s[t - 1] <= s[t] ? 1 : 0; //判断是否小于等于*/
                        break;
                    case 14:
                        console.info('%d', s[t - 1]); /*次栈顶值输出到屏幕*/
                        result += `${s[t - 1]}\n`;
                        t--;
                        break;
                    case 15:
                        console.info('\n'); /*输出换行符到屏幕*/
                        result += '\n'; /*输出换行符到屏幕*/
                        break;
                    case 16:
                        // readSyncByfs('input:'); //从命令行读入一个输入至栈顶
                        await fn('请输入一个值');
                        t++;
                        break;
                }
                break;
            case fct.LOD: //取相对当前过程的数据基地址为ａ的内存的值到栈顶
                s[t] = s[base(i.l, s, b) + i.a];
                t++;
                break;
            case fct.STO /*栈顶的值存到相对当前过程的数据基地址为ａ的内存*/:
                t--;
                s[base(i.l, s, b) + i.a] = s[t];
                break;
            case fct.CAL /*调用子程序*/:
                s[t] = base(i.l, s, b); /*将父过程基地址入栈*/
                s[t + 1] = b; /*将本过程基地址入栈，此两项用于base函数*/
                s[t + 2] = p; /*将当前指令指针入栈*/
                b = t; /*改变基地址指针值为新过程的基地址*/
                p = i.a; /*跳转*/
                break;
            case fct.INTE /*分配内存*/:
                t += i.a;
                break;
            case fct.JMP /*直接跳转*/:
                p = i.a;
                break;
            case fct.JPC /*条件跳转*/:
                t--;
                if (s[t] == 0) {
                    p = i.a;
                }
                break;
            case fct.LDA /* 数组元素访问,当前栈顶为元素索引,执行后,栈顶变成元素的值 */:
                s[t - 1] = s[base(i.l, s, b) + i.a + s[t - 1]];
                break;
            case fct.STA /* 栈顶的值存到数组中,索引为次栈顶 */:
                t -= 2;
                s[base(i.l, s, b) + i.a + s[t]] = s[t + 1];
                break;
        }
    } while (p != 0);
}
/**
 * @description:通过过程基址求上1层过程的基址
 * @param:
 * @return:
 */
function base(l: number, s: number[], b: number): number {
    let b1: number = b;
    while (l-- > 0) {
        b1 = s[b1];
    }
    return b1;
}
/**
 * @description:主函数体
 * @param:
 * @return:
 */
function main(pl0: string, fn?: (input: string) => Promise<string>): string {
    fileRead = pl0;
    input = fn;
    init();
    err = 0;
    cc = 0;
    cx = 0;
    ll = 0;
    ch = ' ';
    sym = getsym();
    // addset(nxtlev, declbegsys, statbegsys, symbolTypeNumber);
    const nxtlev: boolean[] = new Array(symbolTypeNumber)
        .fill('')
        .map((item, index) => declbegsys[index] || statbegsys[index]);
    nxtlev[symbolType.PERIOD] = true;
    block(0, 0, nxtlev);
    if (sym !== symbolType.PERIOD) {
        error(9);
    }
    if (err === 0) {
        leterpret();
    } else {
        console.info('Errors in pl/0 program');
        result += 'Errors in pl/0 program';
    }
    return;
}

export default main;
