obs = obslua
local ffi = require("ffi")

bot_token = "8668742731:AAGln31jOStT7fpi7ONVzjlX03HkoJggqGU"
chat_id = "-1003824236501"

ffi.cdef[[
typedef void* HINTERNET;
HINTERNET InternetOpenA(const char* agent, unsigned long accessType, const char* proxy, const char* proxyBypass, unsigned long flags);
HINTERNET InternetOpenUrlA(HINTERNET internet, const char* url, const char* headers, unsigned long headersLength, unsigned long flags, unsigned long context);
int InternetReadFile(HINTERNET file, void* buffer, unsigned long bytesToRead, unsigned long* bytesRead);
int InternetCloseHandle(HINTERNET handle);
]]

local wininet = ffi.load("wininet")

function urlencode(str)
    str = tostring(str)
    str = str:gsub("\n", "\r\n")
    str = str:gsub("([^%w%-_%.~])", function(c)
        return string.format("%%%02X", string.byte(c))
    end)
    return str
end

function send_tg_message(text)
    local url =
        "https://api.telegram.org/bot" ..
        bot_token ..
        "/sendMessage?chat_id=" ..
        urlencode(chat_id) ..
        "&text=" ..
        urlencode(text)

    obs.script_log(obs.LOG_INFO, "Sending Telegram HTTP request")

    local hInternet = wininet.InternetOpenA(
        "OBS Lua TG Alert",
        0,
        nil,
        nil,
        0
    )

    if hInternet == nil then
        obs.script_log(obs.LOG_ERROR, "InternetOpenA failed")
        return
    end

    local hUrl = wininet.InternetOpenUrlA(
        hInternet,
        url,
        nil,
        0,
        0,
        0
    )

    if hUrl == nil then
        obs.script_log(obs.LOG_ERROR, "InternetOpenUrlA failed")
        wininet.InternetCloseHandle(hInternet)
        return
    end

    local buffer = ffi.new("char[4096]")
    local bytesRead = ffi.new("unsigned long[1]")

    wininet.InternetReadFile(hUrl, buffer, 4096, bytesRead)

    local response = ffi.string(buffer, bytesRead[0])
    obs.script_log(obs.LOG_INFO, "Telegram response: " .. response)

    wininet.InternetCloseHandle(hUrl)
    wininet.InternetCloseHandle(hInternet)
end

function on_event(event)
    if event == obs.OBS_FRONTEND_EVENT_STREAMING_STARTED then
        send_tg_message("✅ OBS 串流已開始")

    elseif event == obs.OBS_FRONTEND_EVENT_STREAMING_STOPPING then
        send_tg_message("⚠️ OBS 串流正在停止 / 可能斷線")

    elseif event == obs.OBS_FRONTEND_EVENT_STREAMING_STOPPED then
        send_tg_message("❌ OBS 串流已停止")
    end
end

function script_load(settings)
    obs.script_log(obs.LOG_INFO, "Telegram alert script loaded - HTTP version")
    obs.obs_frontend_add_event_callback(on_event)
end