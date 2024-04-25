/*index.js
 *
 * Copyright (c) 2023 Hemlock
 * Author: Bradly Strachan
 * 
 * This file is part of Hemlock, which is released under the GNU General Public License v3.0.
 * See the file LICENSE in this distribution for more information.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import './css/index.css';
import config from './config/config'
import App from './components/App';
import { AlertModalProvider } from './components/AlertModalContext'
import { BookDetailProvider } from './components/BookDetailContext';
import { ConfigProvider } from 'antd';

const root = ReactDOM.createRoot(document.getElementById('root'));

const defaultTheme = {
  "token": {
    "colorPrimary": config.website.theme.primary,
    "colorInfo": config.website.theme.primary,
    "colorBgBase": config.website.theme.bgBase,
    "colorTextBase": config.website.theme.textBase,
    "sizeStep": config.website.theme.sizeStep,
    "wireframe": false,
    "borderRadius": config.website.theme.borderRadius,
  },
  "components": {
    "Layout": {
      "headerBg": config.website.theme.primary,
      "siderBg": config.website.theme.bgBase,
    },
    "Table": {
      "rowSelectedBg": config.website.theme.secondary,
      "rowSelectedHoverBg": config.website.theme.tertiary,
    },
    "Typography": {
      "titleMarginTop": '0em',
    },
    "Carousel": {
      "colorBgContainer": config.website.theme.primary,
    }
  }
};

root.render(
  <React.StrictMode>
    <ConfigProvider direction="ltr" theme={defaultTheme}>
      <AlertModalProvider>
        <BookDetailProvider>
          <App />
        </BookDetailProvider>
      </AlertModalProvider>
    </ConfigProvider>
  </React.StrictMode>
);
