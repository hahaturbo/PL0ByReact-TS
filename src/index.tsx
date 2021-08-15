import React, { useState } from 'react';
import { render } from 'react-dom';
import { Input } from 'antd';
const { TextArea } = Input;
import { Button, Modal } from 'antd';
import './index.less';
// import main from './until/pl0';

const App = () => {
    const [visible, setVisible] = useState(false);

    const showModal = () => {
        setVisible(true);
    };

    const handleOk = () => {
        setVisible(false);
        showModal();
    };

    const handleCancel = () => {
        setVisible(false);
    };

    const start = () => {
        // main('',showModal);
    };
    return (
        <div className="container">
            <h1 style={{ position: 'absolute', top: 50, left: 300 }}>计科3班周厚溧3118004798</h1>
            <Modal title="请输入" visible={visible} onOk={handleOk} onCancel={handleCancel}>
                <Input placeholder="请输入要输入的值"/>
            </Modal>
            <div className="input">
                <TextArea rows={20} />
                <Button type="primary" onClick={start}>开始</Button>
            </div>
            <div className="output">
                <TextArea rows={20} />
                <Button type='dashed'>清空</Button>
            </div>
        </div>
    );
};

render(<App />, document.getElementById('app'));
