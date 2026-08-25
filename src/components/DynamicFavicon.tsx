// components/DynamicFavicon.jsx
import { useEffect, useState } from "react";

const DefaultFaviconHref = "/favicon.svg";

const DynamicFavicon = ({ count }: { count: number }) => {
  const [isVisibleNotification, setIsVisibleNotification] = useState(false);

  useEffect(() => {
    if (count <= 0) {
      // Если нет оповещений - возвращаем обычную иконку
      const defaultFavicon = document.querySelector('link[rel="icon"]');
      if (defaultFavicon) {
        document.head.removeChild(defaultFavicon);
      }

      const link = document.createElement("link");
      link.rel = "icon";
      link.href = DefaultFaviconHref; // путь к вашей обычной иконке
      document.head.appendChild(link);
      return;
    }

    //drawNotification(count);

    const blinkInterval = setInterval(() => {
      setIsVisibleNotification((prev) => !prev);
    }, 800);

    return () => clearInterval(blinkInterval);
  }, [count]);

  // Эффект для моргания
  useEffect(() => {
    if (!isVisibleNotification) {
      updateFavicon(DefaultFaviconHref);
    } else {
      drawNotification(count);
    }
  }, [isVisibleNotification, count]);

  const drawNotification = (count: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");

    // Загружаем основную иконку
    const img = new Image();
    img.src = DefaultFaviconHref; // путь к вашей обычной иконке

    img.onload = () => {
      if (ctx === null) {
        return;
      }
      // Рисуем основную иконку
      ctx.drawImage(img, 0, 0, 32, 32);

      // Рисуем красный круг
      const circleX = 24;
      const circleY = 22;
      const radius = 10;

      ctx.beginPath();
      ctx.arc(circleX, circleY, radius, 0, 2 * Math.PI);
      ctx.fillStyle = "#ff0000";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Рисуем число
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(count > 99 ? "99+" : count.toString(), circleX, circleY);

      // Обновляем фавиконку
      updateFavicon(canvas.toDataURL("image/png"));
    };
  };

  const updateFavicon = (href: string) => {
    const existingFavicon: HTMLLinkElement | null =
      document.querySelector('link[rel="icon"]');
    if (existingFavicon) {
      existingFavicon.href = href;
    } else {
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = href;
      document.head.appendChild(link);
    }
  };

  return null;
};

export default DynamicFavicon;
