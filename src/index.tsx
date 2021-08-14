import React, { useState } from 'react';
import { render } from 'react-dom';
import { Input } from 'antd';
const { TextArea } = Input;
import { Button, Modal } from 'antd';
import './index.less';
// import main from './until/pl0';

const App = () => {
    const [isModalVisible, setIsModalVisible] = useState(false);

    const showModal = () => {
        setIsModalVisible(true);
    };

    const handleOk = () => {
        setIsModalVisible(false);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
    };

    const start = () => {
        // main('',showModal);
    };
    return (
        <div className="container">
            <h1 style={{ position: 'absolute', top: 50, left: 300 }}>计科3班周厚溧3118004798</h1>
            <Modal title="请输入" visible={isModalVisible} onOk={handleOk} onCancel={handleCancel}>
                <Input></Input>
            </Modal>
            <div className="input">
                <TextArea rows={20} />
                <Button onClick={start}>开始</Button>
            </div>
            <div className="output">
                <TextArea rows={20} />
                <Button>清空</Button>
            </div>
        </div>
    );
};

render(<App />, document.getElementById('app'));
