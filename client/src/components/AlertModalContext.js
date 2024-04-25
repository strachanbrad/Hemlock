/*AlertModalContext.js
 *
 * Copyright (c) 2023 Hemlock
 * Author: Bradly Strachan
 * 
 * This file is part of Hemlock, which is released under the GNU General Public License v3.0.
 * See the file LICENSE in this distribution for more information.
 */

import React, { createContext, useContext, useState } from 'react';
import { Modal } from 'antd';

const AlertModalContext = createContext({
  showModal: (content, Component, props) => {},
  hideModal: () => {}
});

export const AlertModalProvider = ({ children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [modalProps, setModalProps] = useState({});

  const showModal = (message, Component = null, props = {}) => {
    setTitle(message);
    setModalProps({
      Component,
      componentProps: props,
    });
    setIsVisible(true);
  };

  const hideModal = () => {
    setIsVisible(false);
    setTitle('');
    setModalProps({});
  };

  return (
    <AlertModalContext.Provider value={{ showModal, hideModal }}>
      {children}
      <Modal
        title={title}
        open={isVisible}
        footer={false}
        onCancel={() => modalProps.componentProps?.onCancel?.()}
        onOk={() => modalProps.componentProps?.onOk?.()}
      >
    {modalProps.Component ? <modalProps.Component {...modalProps.componentProps} /> : ''}
      </Modal>
    </AlertModalContext.Provider>
  );
};

export const useAlertModal = () => useContext(AlertModalContext);
