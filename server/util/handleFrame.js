// 解析Socket数据帧的方法
// 作者:龙恩0707 
// 参考地址： https://www.cnblogs.com/tugenhua0707/p/8542890.html
function decodeFrame(e) {
    var i = 0, j, s, arrs = [],
        frame = {
            // 解析前两个字节的基本数据
            FIN: e[i] >> 7,
            Opcode: e[i++] & 15,
            Mask: e[i] >> 7,
            PayloadLength: e[i++] & 0x7F
        };

    // 处理特殊长度126和127
    if (frame.PayloadLength === 126) {
        frame.PayloadLength = (e[i++] << 8) + e[i++];
    }
    if (frame.PayloadLength === 127) {
        i += 4; // 长度一般用4个字节的整型，前四个字节一般为长整型留空的。
        frame.PayloadLength = (e[i++] << 24) + (e[i++] << 16) + (e[i++] << 8) + e[i++];
    }
    // 判断是否使用掩码
    if (frame.Mask) {
        // 获取掩码实体
        frame.MaskingKey = [e[i++], e[i++], e[i++], e[i++]];
        // 对数据和掩码做异或运算
        for (j = 0, arrs = []; j < frame.PayloadLength; j++) {
            arrs.push(e[i + j] ^ frame.MaskingKey[j % 4]);
        }
    } else {
        // 否则的话 直接使用数据
        arrs = e.slice(i, i + frame.PayloadLength);
    }
    // 数组转换成缓冲区来使用
    arrs = new Buffer.from(arrs);
    // 如果有必要则把缓冲区转换成字符串来使用
    if (frame.Opcode === 1) {
        arrs = arrs.toString();
    }
    // 设置上数据部分
    frame.PayloadLength = arrs;
    // 返回数据帧
    return frame;
}


// 接收数据并返回Socket数据帧的方法
// 作者:小胡子哥
// 参考地址： https://www.cnblogs.com/hustskyking/p/websocket-with-node.html
function encodeFrame(e) {
    var s = [], o = Buffer.from(e.PayloadData), l = o.length;
    //输入第一个字节
    s.push((e.FIN << 7) + e.Opcode);
    //输入第二个字节，判断它的长度并放入相应的后续长度消息
    //永远不使用掩码
    if (l < 126) s.push(l);
    else if (l < 0x10000) s.push(126, (l & 0xFF00) >> 8, l & 0xFF);
    else s.push(
        127, 0, 0, 0, 0, //8字节数据，前4字节一般没用留空
        (l & 0xFF000000) >> 6, (l & 0xFF0000) >> 4, (l & 0xFF00) >> 8, l & 0xFF
    );
    //返回头部分和数据部分的合并缓冲区
    return Buffer.concat([new Buffer(s), o]);
}
module.exports = {
    decodeFrame,
    encodeFrame
}