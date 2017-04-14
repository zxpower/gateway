#!/bin/bash
# Usage:
#   ./gateway-update.sh.sh [parent_directory] 
#   example usage:
#       ./gateway-update.sh /home/pi/gateway

updateRepo() {
    local dir="$1"
    cd $dir # switch to the git repo
    repo_url=$(git config --get remote.origin.url)

    echo "****************************************************************************"
    echo "Updating Repo: $dir with url: $repo_url"
    echo "Starting update in $PWD"

    main_branch="master" 

    # reseting the local changes and update the repo
    echo -e "\ncalling: git fetch & reset"
    (git fetch --all && git reset --hard)

    echo ""
}

dir_to_update=${1}
log_dir=~/gateway/logs/gateway.sys.log

if [ -z "$dir_to_update" ] ; then
    echo "Updating current directory"
    dir_to_update=$PWD
fi 

if [ -f "${dir_to_update}/.updatenow" ] ; then
    updateRepo $dir_to_update >> $log_dir
    rm -rf ${dir_to_update}/.updatenow
    echo "OpenMiniHub gateway has been updated" >> $log_dir
    mosquitto_pub -h localhost -p 1883 -u pi -P raspberry -t system/update -m updated
    echo "Restarting gateway.service" >> $log_dir
    sudo systemctl restart gateway.service >> $log_dir
fi
