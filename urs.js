define(["jquery", "./codec"], function($, codec){
    "use strict";
    var AJAX_TIMEOUT = 5000;
    var URS_SUCCESS_CODE = "201";
    var API_MAP = {
        "163.com": "https://reg.163.com/services/userlogin",
        "126.com": "http://passport.126.com/services/userlogin",
        "yeah.net": "http://passport.yeah.net/services/userlogin",
        "netease.com": "http://passport.yeah.net/services/userlogin",
        "188.com": "http://passport.188.com/services/userlogin",
        "vip.188.com": "http://passport.188.com/services/userlogin",
        "vip.126.com": "http://passport.126.com/services/userlogin",
        "vip.163.com": "https://reg.163.com/services/userlogin"
    };
    var PRODUCT_MAP = {
        "163.com": "mail163",
        "126.com": "mail126",
        "yeah.net": "mailyeah",
        "netease.com": "mailyeah",
        "188.com": "mail188",
        "vip.188.com": "mail188",
        "vip.126.com": "mailvip126",
        "vip.163.com": "mailvip"
    };
    
    /**
     * 登录网易通行证时出现的错误
     * @param {string} errCode 错误码
     * @param {any} context 发生错误时的上下文信息
     */
    var URSError = function(errCode, context) {
        this.context = context;
        if(typeof(errCode) === "object" && errCode.errCode && errCode.msg) {
            this.errCode = errCode.errCode;
            this.msg = errCode.msg;
        } else {
            this.errCode = "" + errCode;
            this.msg = URSError.msgForCode(this.errCode);
            if(!this.msg) {
                this.errCode = URSError.SERVER_ERR.errCode;
                this.msg = URSError.SERVER_ERR.msg;
            }
        }
    };
    URSError.prototype = new Error();
    URSError.prototype.constructor = URSError;
    URSError.ILLEGAL_PARAM = {errCode: "401", msg: "参数错误"};
    URSError.EXCEED_LIMIT = {errCode: "412", msg: "密码错误次数过多，请1小时后再重试"};
    URSError.NOT_EXISTS = {errCode: "420", msg: "帐号不存在"};
    URSError.FROZEN = {errCode: "422", msg: "帐号被冻结"};
    URSError.NOT_MATCH = {errCode: "460", msg: "密码错误"};
    URSError.ABORT = {errCode: "498", msg: "请求中止"};
    URSError.NET_ERR = {errCode: "499", msg: "网络异常"};
    URSError.SERVER_ERR = {errCode: "500", msg: "服务端异常"};
    URSError.TIMEOUT = {errCode: "504", msg: "超时"};
    URSError.msgForCode = function(errCode) {
        if(!errCode) {
            return undefined;
        }
        for(var key in URSError) {
            if(URSError.hasOwnProperty(key) && key.errCode === errCode && key.msg) {
                return key.msg;
            }
        }
        return undefined;
    };
    
    /**
     * 把网易通行证的明文密码转换成md5hex后的密码
     * @param  {string} password 明文密码
     * @return {string} md5hex后的密码
     */
    var md5hex = function(password) {
        if (!password) {
            return "";
        }
        
        password = password.replace("\\", "\\\\");
        password = password.replace("'", "\\'");
        return codec.md5hex(password);
    };
    
    /**
     * 登录网易通行证
     * @param  {string} username 用户名
     * @param  {string} password 密码
     * @param  {[object]} settings: {
     *                        timeout: number, // optional, 网络超时时间, 单位毫秒. 默认5000
     *                        passwordType: number // optional, 密码是否md5处理后的. 0: 是, 1: 否. 默认0
     *                    }
     * @return {deferred} resolve({
     *                        username: string, // 用户邮箱地址
     *                        cookie: string // NTES_SESS cookie值
     *                    }),
     *                    reject({
     *                        errCode: string, // 错误码
     *                        msg: string, // 错误描述
     *                        context: string // 参数错误时: 错误的参数名; 登录失败时: 用户名
     *                    })
     */
    var login = function(username, password, settings) {
        var deferred = $.Deferred();
        if (!username) {
            deferred.reject(new URSError(URSError.ILLEGAL_PARAM, "username"));
            return deferred;
        }
        if (!password) {
            deferred.reject(new URSError(URSError.ILLEGAL_PARAM, "password"));
            return deferred;
        }
        var domain = "";
        var idx = username.indexOf("@");
        if (idx > -1) {
            domain = username.substr(idx + 1);
        }
        if(!(domain in API_MAP)) {
            deferred.reject(new URSError(URSError.ILLEGAL_PARAM, "username"));
            return deferred;
        }
        
        var defaultSettings = {
            timeout: AJAX_TIMEOUT,
            product: PRODUCT_MAP[domain],
            saveLogin: 0, // "记住我",
            setcookie: 1, // 是否设置cookie. 0: 否, 1: 是
            passwordType: 0 // 密码是否md5处理后的. 0: 是, 1: 否
        };
        settings = $.extend(true, settings, defaultSettings);
        
        var url = API_MAP[domain];
        var ajaxOpts = {
            url: url,
            type : "POST",
            cache: false,
            timeout: settings.timeout,
            data: {
                username: username,
                password: password,
                product : settings.product,
                type: settings.setcookie,
                savelogin: settings.saveLogin,
                passtype: settings.passwordType
            }
        };
        $.ajax(ajaxOpts).done(function(data, textStatus, jqXHR){
            var retcode;
            if ("success" === textStatus) {
                // restr format:
                // $errCode\n$description\n\n$details
                var lines = data.split(/\r\n|\r|\n/);
                retcode = lines[0];
                if (retcode === URS_SUCCESS_CODE) {
                    var cookie = "";
                    if(lines.length > 3) {
                        var cookieStr = lines[3];
                        var idx = cookieStr.indexOf("=");
                        cookie = cookieStr.substr(idx + 1);
                    }
                    
                    deferred.resolve({
                        username: username,
                        cookie: cookie
                    });
                    return;
                }
            } else if("timeout" === textStatus) {
                retcode = URSError.TIMEOUT;
            } else if("abort" === textStatus) {
                retcode = URSError.ABORT;
            }
            deferred.reject(new URSError(retcode, username));
        }).fail(function(jqXHR, textStatus, errorThrown){
            var retcode = URSError.SERVER_ERR;
            if("timeout" === textStatus) {
                retcode = URSError.TIMEOUT;
            } else if("abort" === textStatus) {
                retcode = URSError.ABORT;
            }
            deferred.reject(new URSError(retcode, username));
        });

        return deferred;
    };
    
    var exports = {
        md5hex: md5hex,
        login: login,
        URSError: URSError
    };
    return exports;
});