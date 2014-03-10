define(["jquery", "events", "./urs"], function($, events, urs){
    "use strict";

    /**
     * 长轮询时出现的错误
     * @param {string} code 错误码
     * @param {any} context 发生错误时的上下文信息
     */
    var PollingError = function(code, context) {
        this.context = context;
        if(typeof(code) === "object" && code.code && code.msg) {
            this.code = code.code;
            this.msg = code.msg;
        } else {
            this.code = "" + code;
            this.msg = PollingError.msgForCode(this.code);
            if(!this.msg) {
                this.code = PollingError.SERVER_ERR.code;
                this.msg = PollingError.SERVER_ERR.msg;
            }
        }
    };
    PollingError.prototype = new Error();
    PollingError.prototype.constructor = PollingError;
    PollingError.name = "PollingError";
    PollingError.ILLEGAL_PARAM = {code: "illegal param", msg: "参数错误"};
    PollingError.UNKNOWN_CLIENTID = {code: "unknown clientid", msg: "连接已丢失"};
    PollingError.EXCEED_MAX_CONN = {code: "exceed max conn", msg: "连接已满"};
    PollingError.CANNOT_CMD = {code: "cannot cmd", msg: "请求暂时无法处理"};
    PollingError.SIGNIN_FAIL = {code: "auth failed", msg: "认证失败"};
    PollingError.SERVER_ERR = {code: "server error", msg: "服务器异常"};
    PollingError.msgForCode = function(code) {
        if(!code) {
            return undefined;
        }
        for(var key in PollingError) {
            if(PollingError.hasOwnProperty(key) && key.code === code && key.msg) {
                return key.msg;
            }
        }
        return undefined;
    };

    var API_MAP = {
        "163.com": "http://push.mail.163.com/cometd",
        "126.com": "http://push.mail.126.com/cometd",
        "yeah.net": "http://push.mail.yeah.net/cometd",
        "netease.com": "http://push.mail.yeah.net/cometd"
    };
    var RETRY_DELAY = 60000;
    var POLLING_TIMEOUT = 120000;
    var DEFAULT_PRODUCT = "chrome";

    var EVENT_INIT_DONE = "InitDone";
    var EVENT_AUTH_FAIL = "LoginFail";
    var EVENT_CONNECT_SUCCESS = "ConnectSuccess";
    var EVENT_POLLING_SUCCESS = "PollingSuccess";
    var EVENT_RECEIVE_MAIL = "ReceiveMail";
    var EVENT_ERROR = "Error";

    var parsePollingResponse = function(data, emitter, caller) {
        if (!Array.isArray(data)) {
            emitter.emit(EVENT_ERROR, new PollingError(PollingError.SERVER_ERR, {caller: caller, obj: data}));
            return;
        }

        for ( var i = 0; i < data.length; i++) {
            var message = data[i];
            if (!message || !message.successful || !message.channel) {
                if(!message.error) {
                    emitter.emit(EVENT_ERROR, new PollingError(PollingError.SERVER_ERR, {caller: caller, obj: message}));
                    return;
                }
                emitter.emit(EVENT_ERROR, new PollingError(message.error.toLowerCase(), {caller: caller, obj: message}));
                return;
            }

            var channel = message.channel;
            if ("/meta/connect" === channel) {
                emitter.emit(EVENT_CONNECT_SUCCESS, message.clientId);
                return;
            } else if ("/service/push" === channel) {
                // ignore, nothing need notify
                return;
            } else if ("/meta/reconnect" == channel) {
                var innerData = message.data;
                if(innerData && "pushmail" === innerData.event && innerData.body) {
                    var body = innerData.body;
                    var mail = {
                        to : $.trim(innerData.uid),
                        from : $.trim(innerData.from),
                        fid : body.folderid,
                        mid : body.Mid,
                        subject : $.trim(body.Subject),
                        content : $.trim(body.Content),
                        count : $.trim(body.count),
                        senddate : body.SentDate,
                        msid : body.MSID,
                        id : body.MSID + ":" + body.Mid
                    };
                    emitter.emit(EVENT_RECEIVE_MAIL, mail);
                }
            } else {
                emitter.emit(EVENT_ERROR, new PollingError(PollingError.SERVER_ERR, {caller: caller, obj: message}));
                return;
            }
        }
        emitter.emit(EVENT_POLLING_SUCCESS);
        return;
    };
    /**
     * 发送请求到polling server
     * @param {function} caller 调用这个方法的函数
     * @param {object} emitter EventEmitter
     * @param {string} url polling server接口url
     * @param {object} msg 发送给polling server的消息
     * @return {jqXHR}
     */
    var sendPollingRequest = function(caller, emitter, url, msg) {
        var arr = [msg];
        var message = JSON.stringify(arr);
        var ajaxOpts = {
            url: url,
            data: {
                message: message
            },
            timeout: POLLING_TIMEOUT,
            dataType: "json"
        };

        var jqXHR = $.ajax(ajaxOpts);
        jqXHR.done(function(data, textStatus, jqXHR){
            if("success" === textStatus) {
                parsePollingResponse(data, emitter, caller);
            } else {
                parsePollingResponse({
                    textStatus: textStatus
                }, emitter, caller);
            }
        }).fail(function(jqXHR, textStatus, errorThrown){
            parsePollingResponse({
                textStatus: textStatus,
                errorThrown: errorThrown
            }, emitter, caller);
        });
        return jqXHR;
    };
    var invokeLater = function(func, delay) {
        var proxy =  function() {
            window.setTimeout(self.start, RETRY_DELAY);
        };
        return proxy;
    };

    /**
     * Polling constructor
     * @param {object} settings: {
     *                     username: string, // 用户邮箱地址
     *                     password: string, // optional, 但password和cookie必须有一个有值; password和cookie都有值时会将cookie置为空字符串. 用户邮箱密码
     *                     cookie: string, // optional, 但password和cookie必须有一个有值; password和cookie都有值时会将cookie置为空字符串. urs cookie
     *                     product: string // optional
     *                 }
     */
    var Polling = function(settings) {
        var emitter = new events.EventEmitter();

        var self = this;
        $.extend(self, settings);
        if(self.password) {
            self.cookie = "";
        }
        self.product = self.product || DEFAULT_PRODUCT;

        var domain = "";
        var idx = self.username.indexOf("@");
        if (idx > -1) {
            domain = self.username.substr(idx + 1);
        }
        if(!(domain in API_MAP)) {
            throw new PollingError(PollingError.ILLEGAL_PARAM, "settings.username");
        }
        var url = API_MAP[domain];
        var pollingXHR;

        /**
         * 初始化（登录urs，如果需要的话）
         *
         */
        var init = function() {
            if(self.cookie) {
                emitter.emit(EVENT_INIT_DONE, self.cookie);
                return;
            }
            var deferred = urs.login(settings.username, settings.password);
            deferred.done(function(ursresult){
                emitter.emit(EVENT_INIT_DONE, ursresult.cookie);
            }).fail(function(urserror){
                emitter.emit(EVENT_AUTH_FAIL, urserror);
            });
        };
        /**
         * connect to the polling server
         * @return {jqXHR} 
         */
        var connect = function(){
            var msg = {
                channel : "/meta/connect",
                timestamp : new Date().getTime()
            };
            return sendPollingRequest(connect, emitter, url ,msg);
        };
        /**
         * signin polling server
         * @return {jqXHR}
         */
        var signin = function() {
            var msg = {
                channel: "/service/push",
                timestamp: new Date().getTime(),
                clientId: self.clientId,
                data: {
                    uid: self.username,
                    auth: self.cookie,
                    product: self.product,
                    event: "login"
                }
            };
            return sendPollingRequest(signin, emitter, url ,msg);
        };
        /**
         * polling message from pushmail server, long polling
         * @return {jqXHR}
         */
        var polling = function() {
            var msg = {
                channel: "/meta/reconnect",
                timestamp: new Date().getTime(),
                clientId: self.clientId
            };
            return sendPollingRequest(polling, emitter, url, msg);
        };

        self.on = function(eventName, handler) {
            emitter.on(eventName, handler);
        };
        self.start = function() {
            init();
        };
        self.stop = function() {
            emitter.clear();
            if(pollingXHR) {
                pollingXHR.abort();
            }
        };

        var registerErrorHandler = function() {
            // 异常处理器
            var errorHandlerMap = {};
            // unknown clientid以及exceed max connection: $RETRY_DELAY后重启
            errorHandlerMap[PollingError.UNKNOWN_CLIENTID.code] = invokeLater(self.start, RETRY_DELAY);
            errorHandlerMap[PollingError.EXCEED_MAX_CONN.code] =invokeLater(self.start, RETRY_DELAY);
            // sign in polling server fail: 清除cookie后再重启, 强制刷新cookie
            errorHandlerMap[PollingError.SIGNIN_FAIL.code] = invokeLater(function(){
                self.cookie = undefined;
                self.start();
            }, RETRY_DELAY);

            // polling error
            self.on(EVENT_ERROR, function(pollingErr){
                var handler = errorHandlerMap[pollingErr.code];
                if(handler) {
                    handler();
                } else if(pollingErr.context.caller){
                    invokeLater(pollingErr.context.caller, RETRY_DELAY);
                } else {
                    throw pollingErr;
                }
            });
        };
        var registerEventHandler= function() {
            // 内部事件循环
            // init done, connect to the polling server
            self.on(EVENT_INIT_DONE, function(cookie){
                self.cookie = cookie;
                connect();
            });
            // connect success, store the clientId, sign in the polling server
            self.on(EVENT_CONNECT_SUCCESS, function(clientId){
                self.clientId = clientId;
                pollingXHR = polling();
                signin();
            });
            self.on(EVENT_POLLING_SUCCESS, function(){
                pollingXHR = polling();
            });
        };
        registerEventHandler();
        registerErrorHandler();
    };
    Polling.EVENT_AUTH_FAIL = EVENT_AUTH_FAIL;
    Polling.EVENT_RECEIVE_MAIL = EVENT_RECEIVE_MAIL;
    Polling.EVENT_ERROR = EVENT_ERROR;

    return {Polling: Polling, PollingError: PollingError};
});