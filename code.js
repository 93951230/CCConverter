// #region 全局變數宣告
const canvas = document.getElementById('ctx');
const ctx = canvas.getContext('2d');
canvas.width=1000;
canvas.height=1000;

var image = undefined;
var imageName = undefined;
var convertedUrl = undefined;
var imageData = undefined;
var scale = undefined;
// #endregion

// #region Worker Code區
const workerCode = `
// #region color metrics
// #region 偏重Hue的算法
function rgbToHSL(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h *= 60;
    }
    return [h, s, l];
}
function hueDistance(h1, h2) {
    return Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));
}
function colorSimilarity(rgb1, rgb2, wH = 5, wS = 2, wL = 1) {
    let [h1, s1, l1] = rgbToHSL(...rgb1);
    let [h2, s2, l2] = rgbToHSL(...rgb2);

    let dH = hueDistance(h1, h2) * wH;
    let dS = Math.abs(s1 - s2) * wS;
    let dL = Math.abs(l1 - l2) * wL;

    return Math.sqrt(dH * dH + dS * dS + dL * dL);
}
// #endregion

// #region L1 and L2 norm
function l1(rgbA,rgbB) {
    return Math.abs(rgbA[0]-rgbB[0]) + Math.abs(rgbA[1]-rgbB[1]) + Math.abs(rgbA[2]-rgbB[2]);
}
function euclidean(rgbA,rgbB) {
    return (rgbA[0]-rgbB[0])**2 + (rgbA[1]-rgbB[1])**2 + (rgbA[2]-rgbB[2])**2;
}
// #endregion

// #region deltaE

function deltaE(rgbA, rgbB) {
  let labA = rgb2lab(rgbA);
  let labB = rgb2lab(rgbB);
  let deltaL = labA[0] - labB[0];
  let deltaA = labA[1] - labB[1];
  let deltaB = labA[2] - labB[2];
  let c1 = Math.sqrt(labA[1] * labA[1] + labA[2] * labA[2]);
  let c2 = Math.sqrt(labB[1] * labB[1] + labB[2] * labB[2]);
  let deltaC = c1 - c2;
  let deltaH = deltaA * deltaA + deltaB * deltaB - deltaC * deltaC;
  deltaH = deltaH < 0 ? 0 : Math.sqrt(deltaH);
  let sc = 1.0 + 0.045 * c1;
  let sh = 1.0 + 0.015 * c1;
  let deltaLKlsl = deltaL / (1.0);
  let deltaCkcsc = deltaC / (sc);
  let deltaHkhsh = deltaH / (sh);
  let i = deltaLKlsl * deltaLKlsl + deltaCkcsc * deltaCkcsc + deltaHkhsh * deltaHkhsh;
  return i < 0 ? 0 : i;
}
function rgb2lab(rgb){
  let r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255, x, y, z;
  r = (r > 0.04045) ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = (g > 0.04045) ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = (b > 0.04045) ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
  z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  x = (x > 0.008856) ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
  y = (y > 0.008856) ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
  z = (z > 0.008856) ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;
  return [(116 * y) - 16, 500 * (x - y), 200 * (y - z)]
}
// #endregion
// #endregion

const colors = [
    [240, 240, 240], //white
    [242, 178, 51],   //orange
    [229, 127, 216],   //magenta
    [153, 178, 242], //lightblue
    [222, 222, 108], //yellow
    [127, 204, 25], //lime
    [242, 178, 204], //pink
    [76, 76, 76], // Gray
    [153, 153, 153],   //lightgray
    [76, 153, 178], //cyan
    [178, 102, 229],   //purple
    [51, 102, 204], //blue
    [127, 102, 76], // brown
    [87, 166, 78],   //green
    [204, 76, 76], //red
    [17, 17, 17]  //black
];
function nearestColor(r, g, b,mode = "deltaE") {
    let minDistance = Infinity;
    let closestIndex = -1;
    
    for (let i = 0; i < 16; i++) {
        let [cr, cg, cb] = colors[i];
        let distance=0;
        if (mode == "deltaE") {
            distance = deltaE([r,g,b],[cr,cg,cb]);
        }
        else if (mode == "hsv") {
            distance = colorSimilarity([r,g,b],[cr,cg,cb]);
        }
        else if (mode == "euclidean") {
            distance = euclidean([r,g,b],[cr,cg,cb]);
        }
        else if (mode == "l1") {
            distance = l1([r,g,b],[cr,cg,cb]);
        }
        
        if (distance < minDistance) {
            minDistance = distance;
            closestIndex = i;
        }
    }
    
    return colors[closestIndex];
}

onmessage = function(e) {
    if (e.data.type == "process") {
        console.log("start processing---");

        let width = e.data.value.width;
        let height = e.data.value.height;
        let totalSize = width*height*4;
        imageData = e.data.value.imageData;
        for (let i=0;i<totalSize;i+=4) {

            let x = (i / 4) % width | 0;
            let y = (i / 4) / width | 0;

            //Progress Handeling
            if (i % 10000 == 0) {
                postMessage({type:"progress_update",value:(i/totalSize)});
            }

            let old_pixel = [imageData.data[i],imageData.data[i+1],imageData.data[i+2]];
            let new_pixel = nearestColor(...old_pixel,e.data.value.colorMetric);

            for (let j=0;j<3;j++) imageData.data[i+j]=new_pixel[j];

            if (!e.data.value.dither) continue;
            let quant_error = [0,0,0];
            for (let j=0;j<3;j++) quant_error[j]=old_pixel[j]-new_pixel[j];

            if (x + 1 < width) {
                for (let j = 0; j < 3; j++) imageData.data[i + 4 + j] += quant_error[j] * (7 / 16);
            }
            if (x - 1 >= 0 && y + 1 < height) {
                for (let j = 0; j < 3; j++) imageData.data[i + (width - 1) * 4 + j] += quant_error[j] * (3 / 16);
            }
            if (y + 1 < height) {
                for (let j = 0; j < 3; j++) imageData.data[i + width * 4 + j] += quant_error[j] * (5 / 16);
            }
            if (x + 1 < width && y + 1 < height) {
                for (let j = 0; j < 3; j++) imageData.data[i + (width + 1) * 4 + j] += quant_error[j] * (1 / 16);
            }
        }
        postMessage({type:"finish",value:imageData});
        postMessage({type:"progress_update",value:1});
        console.log("end processing---");
    }

};`;
const worker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: "application/javascript" })));
// #endregion

// #region 前端區
worker.onmessage = (e) => {
    if (e.data.type=="progress_update") {
        let temp = document.getElementById("progress-bar");
        let prog = Math.floor(e.data.value*10000)/100+ "%";
        temp.dataset.content = "Progress: "+prog;
        temp.style.setProperty("--progress-width",prog);
    }
    else if (e.data.type=="finish") {
        imageData = e.data.value;
        
        if (image.width < image.height) {
            ctx.putImageData(imageData,image.width*scale+20,0);
        }
        else {
            ctx.putImageData(imageData,0,image.height*scale+20);
        }

        imageDataToBlob(imageData).then((result)=>{
            convertedUrl = URL.createObjectURL(result);
        })

    }
};

// #region 右方按鈕 事件監聽
function run() {
    if (!image) {
        document.getElementById("image-info").innerText="INFO: 沒有上傳圖QQ";
        return;
    }

    let modDom = document.getElementById('image-size-output-mode');
    let sizeInput = document.getElementById('image-size-input');
    if (modDom.value == "truncateMin") {
        scale = Math.min(sizeInput.value/image.width,sizeInput.value/image.height,1);
    }
    else if (modDom.value == "scale") {
        scale = sizeInput.value;
    }
    
    if (image.width < image.height) {
        canvas.width=scale*image.width*2+20;
        canvas.height=scale*image.height+20;
    }
    else {
        canvas.height=scale*image.height*2+20;
        canvas.width=scale*image.width+20;
    }
    
    ctx.scale(scale,scale);
    ctx.drawImage(image,0,0);

    ctx.fillRect(image.width,image.height,10,10);
    

    imageData =ctx.getImageData(0,0,image.width,image.height);
    worker.postMessage({type:"process",value:{
        imageData:imageData,
        width:image.width,
        height:image.height,
        dither:document.getElementById("do-dithering").checked,
        colorMetric:document.getElementById("color-algo").value
    }});
    document.getElementById('image-size-input').oninput();
}
function downloadConvertedImg() {
    if (!convertedUrl) {
        document.getElementById("image-info").innerText="INFO: 沒有已轉換的圖QQ";
        return;
    }
    
    let a = document.createElement("a");
    a.href = convertedUrl;
    a.download = "converted_"+imageName.substr(0,imageName.lastIndexOf('.'))+".png";
    a.click();

}
const colorMap = {
    720:'0',
    471:'1',
    572:'2',
    573:'3',
    552:'4',
    356:'5',
    624:'6',
    228:'7',
    459:'8',
    407:'9',
    509:'a',
    357:'b',
    305:'c',
    331:'d',
    355:'e',
    51:'f'
};
function downloadCCFormat(d) {
    if (!image) {
        document.getElementById("image-info").innerText="INFO: QQ";
        return;
    } 
    var ans = "";
    let w = image.width*scale | 0, h= image.height*scale | 0

    if (image.width < image.height) {
        _imageData = ctx.getImageData(w+20,0,w,h);
    }
    else {
        _imageData = ctx.getImageData(0,h+20,w,h);
    }

    for (let i=0;i<_imageData.data.length;i+=4) {
        let rgbSum = _imageData.data[i]+_imageData.data[i+1]+_imageData.data[i+2];

        if (rgbSum==356 && _imageData.data[i]==204) rgbSum-=1;

        ans += colorMap[rgbSum];
        if (((i>>2)+1)%w === 0) {
            ans += '\n';
        }
    }

    console.log(w);
    const blob = new Blob([ans], {type: 'application/json'});
    const url = URL.createObjectURL(blob)

    // 模擬檔案下載
    const aTag = document.createElement('a')
    aTag.href = url
    aTag.download = "CCPaintable_"+imageName.substr(0,imageName.lastIndexOf('.'))+".json";
    aTag.click()

    // 清掉暫存
    aTag.href = '';
    URL.revokeObjectURL(url);
}
const imageDataToBlob = function(imageData){
    let w = image.width*scale | 0;
    let h = image.height*scale | 0;
    let canvas_ = document.createElement("canvas");
    canvas_.width = w;
    canvas_.height = h;
    let ctx = canvas_.getContext("2d");
    ctx.putImageData(imageData, 0, 0); // synchronous

    return new Promise((resolve) => {
        canvas_.toBlob(resolve,"image/png",1); // implied image/png format
    });
}
document.getElementById('actually-file-uploader').oninput = (e) => {
    console.log("File uploaded.");
    imageName = e.target.files[0].name;
    document.getElementById("image-info").innerText="INFO: 轉換圖片：" + imageName;

    image = document.createElement('img');
    document.body.appendChild(image);
    image.style = "display:none;";
    var reader = new FileReader();
    reader.readAsDataURL(new Blob([e.target.files[0]], { type: 'image/png' })); 
    reader.onloadend = () => {image.src = reader.result;}

    setTimeout(()=>{
        run();

        document.getElementById("image-info").innerText = "INFO: 圖片尺寸為（"+image.width+","+image.height+"）";
    },100);
};
// #endregion

// #region 左方DOM元素 事件監聽
document.getElementById('CC-width').oninput = function() {
    let w = 14+22*(document.getElementById('CC-width').value-1),h = 15+21*(document.getElementById('CC-height').value-1);
    document.getElementById('size-info').innerText = "螢幕可支援輸出像素寬："+w+" 高："+h;
}
document.getElementById('CC-height').oninput = document.getElementById('CC-width').oninput;
document.getElementById('image-size-output-mode').oninput = function() {
    let modDom = document.getElementById('image-size-output-mode');
    let followUp = document.getElementById('image-size-output-mode-follow-up');
    let sizeInput = document.getElementById('image-size-input');

    if (modDom.value == "truncateMin") {
        followUp.innerText = "點像素"
        sizeInput.value = 1000;
    }
    else if (modDom.value == "scale") {
        followUp.innerText = "倍";
        sizeInput.value = 1;
    }

    document.getElementById('image-size-input').oninput();
}
document.getElementById('image-size-input').oninput = function () {
    if (!image) return;
    let modDom = document.getElementById('image-size-output-mode');
    let sizeInput = document.getElementById('image-size-input');
    let sizeInfo = document.getElementById('size-info-2');

    let t_scale =0;
    if (modDom.value == "truncateMin") {
        t_scale = Math.min(sizeInput.value/image.width,sizeInput.value/image.height,1);
    }
    else if (modDom.value == "scale") {
        t_scale = sizeInput.value;
    }

    sizeInfo.innerText = "圖片尺寸：（"+((image.width*t_scale)|0)+","+((image.height*t_scale)|0)+")";
}
// #endregion

// #endregion