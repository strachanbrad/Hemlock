/*ToggleIcon.js
 *
 * Copyright (c) 2023 Hemlock
 * Author: Bradly Strachan
 * 
 * This file is part of Hemlock, which is released under the GNU General Public License v3.0.
 * See the file LICENSE in this distribution for more information.
 */

import React, { useState } from 'react';

const ToggleIcon = ({ initialValue = false, isInteractive, trueIcon, falseIcon, height, color, onToggle = () => {} }) => {
  const [value, setValue] = useState(initialValue);

  const handleClick = () => {
    if (isInteractive) {
      const newValue = value === 0 ? 1 : 0;
      setValue(newValue);
      onToggle(newValue);
    }
  };

  const IconComponent = value === 1 ? trueIcon : falseIcon;

  return (
    <div onClick={handleClick} style={{ cursor: isInteractive ? 'pointer' : 'default' }}>
      <IconComponent style={{ fontSize: height, color }} />
    </div>
  );
};

export default ToggleIcon;
