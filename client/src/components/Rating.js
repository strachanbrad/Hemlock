/*Rating.js
 *
 * Copyright (c) 2023 Hemlock
 * Author: Bradly Strachan
 * 
 * This file is part of Hemlock, which is released under the GNU General Public License v3.0.
 * See the file LICENSE in this distribution for more information.
 */

import React, { useState } from 'react';

const MAX_RATING = 5;

const Rating = ({ initialRating, isInteractive, filledSVG, unfilledSVG, height, color, onRatingChange = ()=>{} }) => {
  const [rating, setRating] = useState(initialRating);

  const handleClick = (newRating) => {
    if (isInteractive) {
      if (newRating === 1 && rating === 1) {
        setRating(0);
        onRatingChange(0);
      } else {
        setRating(newRating);
        onRatingChange(newRating);
      }
    }
  };

  return (
    <div style={{ display: 'flex' }}>
      {Array.from({ length: MAX_RATING }).map((_, index) => {
        // Directly use the component passed in props
        const Element = index < rating ? filledSVG : unfilledSVG;
        return (
          <div key={`${index}-${rating}`} onClick={() => handleClick(index + 1)} style={{ cursor: isInteractive ? 'pointer' : 'default' }}>
            <Element style={{ height: `${height}px`, width: 'auto', fill: color }} />
          </div>
        );
      })}
    </div>
  );
};

export default Rating;
