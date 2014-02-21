/*
Copyright (c) 2014, dhf
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice, this
  list of conditions and the following disclaimer in the documentation and/or
  other materials provided with the distribution.

* Neither the name of the {organization} nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
/**
 * 登录网易URS通行证
 */
var URS;
if (!URS) {
	URS = {};
}
(function() {
	var loginAPIURLMap = {
		"163.com": "https://reg.163.com/services/userlogin",
		"126.com": "http://passport.126.com/services/userlogin",
		"yeah.net": "http://passport.yeah.net/services/userlogin",
		"188.com": "http://passport.188.com/services/userlogin",
		"vip.188.com": "http://passport.188.com/services/userlogin",
		"vip.126.com": "http://passport.126.com/services/userlogin",
		"vip.163.com": "https://reg.163.com/services/userlogin"
	};
	
	// 默认登录失败处理函数
	var onLoginFailDefault = function(username, retcode) {
		if (!retcode) {
			// http status is not success
			throw "网络异常";
		} else if ("412" === retcode) {
			// wrong time exceed limit
			throw "密码错误次数过多，请1小时后再重试";
		} else if ("420" === retcode) {
			// user not found
			throw "帐号不存在";
		} else if ("422" === retcode) {
			// user locked
			throw "帐号被冻结";
		} else if ("460" === retcode) {
			// verify fail
			throw "密码错误";
		} else if ("401" === retcode) {
			// illegal parameters
			throw "程序异常";
		} else {
			// 
			throw "服务器异常";
		}
	};

	URS.getDefaultOnFail = function() {
		return onLoginFailDefault;
	};

	URS.md5HexPwd = function(str) {
		if (!str) {
			return "";
		}
		str = str.replace("\\", "\\\\");
		str = str.replace("'", "\\'");
		return hex_md5(str);
	};

	/**
	 * @param username: required, string
	 * @param password: required, string, md5Hex
	 * @param settings: optional, object
	 * <pre>
     * {
     * 	async : $async, // boolean
     * 	onSuc : $onSuc, // function, onSuc(username, urscookie)
     * 	onFail : $onFail //function, onFail(username, retcode), 
     * 					// retcode is undefined when network error
     * }
     * </pre>
	 * @returns
	 */
	URS.login = function(username, password, settings) {
		if (!username) {
			throw "username is undefined!";
		}
		if (!password) {
			throw "password is undefined!";
		}

		var async = settings.async;
		var timeout = settings.timeout;
		var onSuc = settings.onSuc;
		var onFail = settings.onFail;

		var product = "mobilemail";
		var type = 1; // 是否设置cookie，0：否；1：是
		var saveLogin = 0;
		var passwdType = 0; // 密码是否md5处理后的，0：是;1：否

		if (typeof (async) !== "boolean") {
			async = true;
		}
		if (typeof (timeout) !== "number") {
			timeout = 5000;
		}
		
		var domain = "163.com";
		var idx = username.indexOf("@");
		if (idx !== -1) {
			domain = username.substr(idx + 1);
		}
		var ursLoginUrl = loginAPIURLMap[domain];

		var xhr = $.ajax({
			url : ursLoginUrl,
			async : async,
			cache : false,
			timeout : timeout,
			type : "POST",
			data : {
				username : username,
				password : password,
				product : product,
				type : type,
				savelogin : saveLogin,
				passtype : passwdType
			},
			success : function(data, status, xhr) {
				var retcode = undefined;
				if (xhr.readyState === 4 && xhr.status === 200) {
					// restr format:
					// $code\n$description\n\n$details
					var lines = data.split(/\r\n|\r|\n/);
					retcode = lines[0];
					// $code === "201" means login successfully
					if ("201" === retcode) {
						// when login successfully, the $details will contain
						// the nessary cookie
						var cookieStr = lines[3];
						var idx = cookieStr.indexOf("=");
						var cookieValue = cookieStr.substr(idx + 1);
						if (onSuc && typeof (onSuc) === "function") {
							onSuc(username, cookieValue);
						}
						return;
					}
				}
				if (onFail && typeof (onFail) === "function") {
					onFail(username, retcode);
				} else {
					onLoginFailDefault(username, retcode);
				}
			},
			error : function(xhr, status, error) {
				if (onFail && typeof (onFail) === "function") {
					onFail(username);
				} else {
					onLoginFailDefault(username);
				}
			}
		});
		return xhr;
	};
})();
