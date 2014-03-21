nplp
====

网易邮箱新邮件实时提醒Javascript SDK（Netease Pushmail Long Polling）


# Example

    define(['./urs', './polling'], function(urs, polling){
        var email = "username@163.com";
        var password = urs.md5hex("password");
        var Polling = polling.Polling;
        var pl = new Polling({username: email, password: password});
        pl.on(Polling.EVENT_AUTH_FAIL, function(urserror){
            /*
                urserror: {
                    code: string,
                    msg: string,
                    context: any
                }
            */
        });
        pl.on(Polling.EVENT_RECEIVE_MAIL, function(mail){
            /*
                mail: {
                    to: string, // 收件人
                    from: string, // 发件人
                    fid: string, // folder id; 
                                 // 1: 收件箱; 2: 草稿箱; 3: 已发送; 4: 已删除; 
                                 // 5: 垃圾箱; 6: 病毒箱; 7: 广告箱; 18: 订阅箱
                    mid: string, // mail id
                    subject: string, // 邮件主题
                    content: string, // 邮件正文摘要
                    count: number, // 同一时间收到的邮件封数
                    senddate: string, // 邮件发送时间
                    msid: string, // 邮件存储服务器id
                    id: string // mail unique id
                }
            */
        });
        pl.on(Polling.EVENT_ERROR, function(pollingErr){
            /*
                pollingErr: {
                    code: string,
                    msg: string,
                    context: any
                }
            */
        });
        pl.start();
    });


# Use cases
[网易邮箱Chrome扩展](https://chrome.google.com/webstore/detail/degnllcmhlfjedphgljfbgjcdijpagpp)

# Dependencies

* jQuery (1.5+, tested under 2.1.0)
* requirejs (tested under 2.1.11)
* events.EventEmitter (tested under nodejs-0.10.26)